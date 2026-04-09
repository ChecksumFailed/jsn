# Flow Creation Implementation Plan

This document outlines the plan for implementing flow and subflow creation in the jsn CLI.

## Overview

Creating flows in ServiceNow is complex due to:
- Multiple related tables (`sys_hub_flow`, `sys_hub_flow_version`, `sys_hub_action_instance`, etc.)
- Version management (published vs draft versions)
- Action/trigger references and their configurations
- Gzipped/compressed data storage for some fields
- Subflow vs Flow type differences

## Phase 1: Research & Discovery

### 1.1 Understand the Data Model

**Tables Involved:**
- `sys_hub_flow` - Main flow definition
- `sys_hub_flow_version` - Version records (contains payload JSON)
- `sys_hub_action_instance` / `sys_hub_action_instance_v2` - Action placements
- `sys_hub_trigger_instance` / `sys_hub_trigger_instance_v2` - Trigger definitions
- `sys_hub_flow_logic` / `sys_hub_flow_logic_instance_v2` - Logic blocks (If/Else)
- `sys_hub_sub_flow_instance` - Subflow calls
- `sys_hub_flow_input` / `sys_hub_flow_output` - Subflow inputs/outputs

**Questions to Answer:**
- [ ] What's the minimum viable data to create a working flow?
- [ ] How is the `payload` field structured in `sys_hub_flow_version`?
- [ ] What generates action instance sys_ids and uiUniqueIdentifiers?
- [ ] How are action inputs stored (plain JSON vs gzipped)?
- [ ] What's the relationship between master snapshot and versions?

### 1.2 API Investigation

Test using `jsn records` commands:

```bash
# Get a simple flow structure
jsn records --table sys_hub_flow <sys_id>

# Get the version record with payload
jsn records --table sys_hub_flow_version --query "flow=<sys_id>" --limit 1

# Get action instances
jsn records --table sys_hub_action_instance_v2 --query "flow=<sys_id>"

# Get trigger instances  
jsn records --table sys_hub_trigger_instance_v2 --query "flow=<sys_id>"
```

**Document:**
- [ ] Required fields for each table
- [ ] Field formats (strings, references, JSON payloads)
- [ ] Auto-generated vs user-provided values

## Phase 2: Basic Flow Creation

### 2.1 Create Empty Flow

**Goal:** Create a minimal valid flow with just metadata

**Implementation:**
```go
// SDK function
func (c *Client) CreateFlow(ctx context.Context, opts CreateFlowOptions) (*Flow, error)

// Options struct
type CreateFlowOptions struct {
    Name        string            // Required
    Type        string            // "flow" or "subflow"
    Description string            // Optional
    Active      bool              // Default: false
    RunAs       string            // "user" or "system"
    Scope       string            // Optional, defaults to user's scope
}
```

**CLI Command:**
```bash
# Interactive
jsn flows create

# Non-interactive
jsn flows create --name "My Flow" --type flow --description "Does something"
```

**Testing:**
- [ ] Create a flow and verify it appears in ServiceNow
- [ ] Check that it has a version record
- [ ] Verify the flow can be opened in Flow Designer
- [ ] Test duplicate name handling

### 2.2 Create Empty Subflow

**Goal:** Create a minimal subflow with inputs/outputs

**Implementation:**
```go
type CreateSubflowOptions struct {
    CreateFlowOptions
    Inputs  []FlowVariableDef
    Outputs []FlowVariableDef
}

type FlowVariableDef struct {
    Name        string
    Label       string
    Type        string // reference, string, boolean, etc.
    Mandatory   bool
    Reference   string // For reference types
    DefaultValue string
}
```

**CLI Command:**
```bash
jsn flows create --name "My Helper" --type subflow \
  --input "record:sys_id:Reference:incident:true" \
  --output "result:string:Result"
```

**Testing:**
- [ ] Create subflow with inputs/outputs
- [ ] Verify inputs/outputs appear in Flow Designer
- [ ] Test calling the subflow from another flow

## Phase 3: Adding Components

### 3.1 Add Trigger

**Goal:** Add a record-based trigger to a flow

**Types:**
- Record Created
- Record Updated
- Record Deleted
- Scheduled
- Subflow (for subflows)

**Implementation:**
```go
type AddTriggerOptions struct {
    FlowID      string
    TriggerType string // "record_create", "record_update", "scheduled", etc.
    Table       string // For record triggers
    Condition   string // Encoded query string
    Schedule    string // For scheduled triggers
}
```

**CLI Command:**
```bash
jsn flows add-trigger "My Flow" --type record_create --table incident --condition "priority=1"
```

**Testing:**
- [ ] Add record trigger and test it fires
- [ ] Add scheduled trigger with cron expression
- [ ] Verify trigger appears in Flow Designer

### 3.2 Add Action

**Goal:** Add an action to a flow

**Challenges:**
- Action types have different input schemas
- Some inputs are required
- References to variables ({{trigger.current}})

**Implementation:**
```go
type AddActionOptions struct {
    FlowID     string
    ActionType string      // e.g., "create_record", "update_record", "send_email"
    ActionName string      // Display name
    Inputs     map[string]string // Input field values
    AfterStep  string      // Insert after this step (optional)
}
```

**CLI Command:**
```bash
# Simple action
jsn flows add-action "My Flow" --type create_record --name "Create Incident"

# With inputs
jsn flows add-action "My Flow" --type update_record \
  --name "Update Priority" \
  --input "table=incident" \
  --input "record_id={{trigger.current.sys_id}}" \
  --input "fields=priority=1"
```

**Testing:**
- [ ] Add Create Record action
- [ ] Add Update Record action with conditions
- [ ] Add Look Up Record action
- [ ] Add Send Email action
- [ ] Test action ordering

### 3.2.1 Add Approval Action (with Role-Based Approvers)

**Goal:** Add approval actions that support both user and role-based approvers

**Implementation:**
```go
type AddApprovalOptions struct {
    FlowID         string
    ActionName     string
    ApproverUser   string      // Specific user sys_id or reference
    ApproverRole   string      // Role name (e.g., "x_demo_travel.finance")
    ApproverField  string      // Field containing approver (e.g., "{{trigger.current.manager}}")
    Condition      string      // Optional condition for approval
    AfterStep      string
}
```

**CLI Commands:**
```bash
# Approval from specific user field
jsn flows add-action "My Flow" --type get_approval \
  --name "Manager Approval" \
  --approver "{{trigger.current.manager}}"

# Approval from role (for travel app finance escalation)
jsn flows add-action "My Flow" --type get_approval \
  --name "Finance Approval" \
  --approver-role "x_demo_travel.finance"

# Approval with delegation support
jsn flows add-action "My Flow" --type get_approval \
  --name "Delegated Approval" \
  --approver "{{Find Delegation.delegate}}" \
  --fallback-approver "{{trigger.current.manager}}"
```

**Approval Action Inputs:**
- `approver` - Primary approver (user reference)
- `approver_role` - Role to get approvers from
- `fallback_approver` - If primary not found
- `delegation_table` - For delegation lookups
- `due_date` - Approval due date
- `reminder_frequency` - Reminder interval

**Testing:**
- [ ] Add approval with user field reference
- [ ] Add approval with role (multiple approvers)
- [ ] Test delegation fallback
- [ ] Test approval conditions
- [ ] Verify approval appears in ServiceNow approval table

**Travel App Example:**
```bash
# Manager approval with delegation
jsn flows add-action "Travel Request Approval" --type get_approval \
  --name "Manager Approval" \
  --approver "{{Find Delegation.delegate}}" \
  --fallback-approver "{{trigger.current.traveler.manager}}"

# Finance escalation approval
jsn flows add-action "Finance Escalation" --type get_approval \
  --name "Finance Team Approval" \
  --approver-role "x_demo_travel.finance"
```

### 3.3 Add Logic Blocks

**Goal:** Add If/Else logic to a flow

**Implementation:**
```go
type AddLogicOptions struct {
    FlowID    string
    LogicType string // "if", "switch", "loop"
    Condition string // For If blocks
    AfterStep string
}
```

**CLI Command:**
```bash
jsn flows add-logic "My Flow" --type if --condition "{{trigger.current.priority}}=1" --name "High Priority"
```

**Testing:**
- [ ] Add If block with condition
- [ ] Add Else block
- [ ] Test nested logic

### 3.4 Add Subflow Call

**Goal:** Call another subflow from a flow

**Implementation:**
```go
type AddSubflowCallOptions struct {
    FlowID       string
    SubflowID    string // or name
    InputMapping map[string]string // Map subflow inputs to values
}
```

**CLI Command:**
```bash
jsn flows add-subflow "My Flow" --subflow "My Helper" \
  --map "record={{trigger.current}}"
```

**Testing:**
- [ ] Call a subflow with inputs
- [ ] Use subflow outputs in parent flow

## Phase 4: Flow Templates

### 4.1 Common Patterns

Create templates for common flow patterns:

**Approval Flow:**
```bash
jsn flows create --template approval \
  --name "Change Approval" \
  --table change_request
```

Creates:
- Record trigger on table
- Get Approval action
- If approved → Update record
- If rejected → Update record

**Notification Flow:**
```bash
jsn flows create --template notification \
  --name "Incident Alert" \
  --table incident \
  --condition "priority=1"
```

Creates:
- Record trigger
- Send Email action to assignment group

### 4.2 Template Structure

Store templates as JSON files:
```json
{
  "name": "approval",
  "description": "Standard approval flow",
  "variables": ["table", "approver_field"],
  "structure": [
    {"type": "trigger", "trigger_type": "record_create"},
    {"type": "action", "action_type": "get_approval"},
    {"type": "logic", "logic_type": "if", "condition": "approved"}
  ]
}
```

## Phase 5: Testing Strategy

### Unit Tests

Test individual functions:
- [ ] `CreateFlow` - Verify correct table insertion
- [ ] `AddTrigger` - Verify trigger record created
- [ ] `AddAction` - Verify action instance created with correct inputs
- [ ] Input validation functions

### Integration Tests

Test end-to-end scenarios:
- [ ] Create flow → Add trigger → Add action → Activate
- [ ] Create subflow → Add inputs → Call from parent flow
- [ ] Create flow from template → Verify structure

### Manual Testing Checklist

For each feature:
1. Create via CLI
2. Open in ServiceNow Flow Designer
3. Verify structure matches intention
4. Test execution (if possible)
5. Check for errors in system logs

### Test Data

Flows to create for testing:
1. **Simple Flow**: Record trigger → Create record → End
2. **Subflow with Inputs**: Accept record ID → Update record → Return status
3. **Approval Flow**: Trigger → Approval → Conditional update
4. **Complex Flow**: Multiple actions, If/Else logic, subflow calls

### Example Reference Flows

These existing flows can be used as reference implementations to understand how actions are structured:

#### Example 1: "test" Flow (sys_id: 4bafa9039340cb10250bf3b9dd03d674)
**Purpose:** Comprehensive demonstration of all major action types

**Structure:**
- **Type:** Flow
- **Actions:** 10 (mix of V1 and V2 action instances)
- **Logic Blocks:** 1 If/Else condition

**Action Types Used:**
1. **Ask For Approval** - User/role-based approval
2. **Create Record** - Insert new record
3. **Create or Update Record** - Upsert operation
4. **Create Task** - Generate task record
5. **Delete Record** - Remove record
6. **Fire Event** - Trigger event for other flows
7. **Log** - Write to flow log
8. **Look Up Records** - Query multiple records
9. **Update Record** - Modify existing record
10. **Wait For Condition** - Async pause until condition met

**View with:**
```bash
jsn flows "test"
# or
jsn flows 4bafa9039340cb10250bf3b9dd03d674
```

#### Example 2: "Add Role to User Or Group" (sys_id: acc377bfc7010110408bc8d6f2c260b2)
**Purpose:** Subflow with inputs/outputs and complex logic

**Structure:**
- **Type:** SubFlow
- **Actions:** 4 (Look Up Record, Create Record)
- **Logic Blocks:** 11 (If/Else for delegation handling)
- **Inputs:** 6 (add_role, is_group, user_id, etc.)
- **Outputs:** 2 (error_message, has_error)

**Key Features:**
- Subflow with typed inputs/outputs
- Delegation lookup logic
- Conditional record creation
- Error handling

**View with:**
```bash
jsn flows "Add Role to User Or Group"
```

#### Example 3: "Software Procurement Flow" 
**Purpose:** Catalog item flow with approvals and tasks

**Structure:**
- **Type:** Flow
- **Actions:** 30 (mix of standard and custom actions)
- **Logic Blocks:** 3 (conditional logic for approvals)

**Key Features:**
- Wait For Condition (approval waits)
- Create Record (tasks)
- Look Up Record (reference data)
- Custom actions (flow-specific)

**View with:**
```bash
jsn flows "Software Procurement Flow"
```

#### Example 4: "Create Task" (Simple Subflow)
**Purpose:** Minimal subflow example

**Structure:**
- **Type:** SubFlow
- **Actions:** 2
- **Logic Blocks:** 0

**View with:**
```bash
jsn flows "Create Task"
```

### Target Implementation Scenarios

These are the specific flows we need to successfully create:

#### Scenario 1: Ticket Creation Flow
**Goal:** Create a flow that triggers when a `ticket` (incident) is created

**Expected Structure:**
```yaml
Name: Ticket Created Handler
Type: Flow
Trigger:
  Type: Record Created
  Table: incident
Actions:
  1. Log Message: "New ticket {{trigger.current.number}} created"
  2. If: Priority is 1 (Critical)
     3. Send Email to: IT Manager
     4. Create Task: "Escalate critical incident"
  5. Else
     6. Add Work Note: "Standard priority ticket"
```

**CLI Commands to Support:**
```bash
# Create the flow
jsn flows create --name "Ticket Created Handler" --type flow

# Add trigger
jsn flows add-trigger "Ticket Created Handler" \
  --type record_create \
  --table incident

# Add log action
jsn flows add-action "Ticket Created Handler" \
  --type log_message \
  --message "New ticket {{trigger.current.number}} created"

# Add conditional logic
jsn flows add-logic "Ticket Created Handler" \
  --type if \
  --condition "priority=1" \
  --name "Critical Priority"

# Add email action inside if block
jsn flows add-action "Ticket Created Handler" \
  --type send_email \
  --to "it-manager@company.com" \
  --subject "Critical Ticket: {{trigger.current.number}}"
```

**Success Criteria:**
- [ ] Flow triggers when incident is created
- [ ] Flow checks priority and sends email for critical tickets
- [ ] Works correctly in ServiceNow

#### Scenario 2: Subflow with Inputs/Outputs
**Goal:** Create a reusable subflow that accepts inputs and returns outputs

**Expected Structure:**
```yaml
Name: Update Ticket Status
Type: Subflow
Inputs:
  - ticket_id (string, required): "The ticket sys_id to update"
  - new_state (string, required): "State to set (New, In Progress, Resolved, etc.)"
  - work_notes (string, optional): "Notes to add"
  - notify_assignee (boolean, optional): "Whether to notify the assignee"
Outputs:
  - success (boolean): "Whether update succeeded"
  - error_message (string): "Error details if failed"
Logic:
  1. Look Up Record: ticket table where sys_id={{input.ticket_id}}
  2. If: Record found
     3. Update Record: state={{input.new_state}}, work_notes={{input.work_notes}}
     4. If: notify_assignee is true
        5. Send Notification to assignee
     6. Assign Outputs: success=true
  7. Else
     8. Assign Outputs: success=false, error_message="Ticket not found"
```

**CLI Commands to Support:**
```bash
# Create subflow
jsn flows create --name "Update Ticket Status" --type subflow

# Add inputs
jsn flows add-input "Update Ticket Status" \
  --name ticket_id \
  --label "Ticket ID" \
  --type string \
  --required

jsn flows add-input "Update Ticket Status" \
  --name new_state \
  --label "New State" \
  --type choice \
  --choices "New,In Progress,Resolved,Closed" \
  --required

jsn flows add-input "Update Ticket Status" \
  --name work_notes \
  --label "Work Notes" \
  --type string

jsn flows add-input "Update Ticket Status" \
  --name notify_assignee \
  --label "Notify Assignee" \
  --type boolean \
  --default false

# Add outputs
jsn flows add-output "Update Ticket Status" \
  --name success \
  --label "Success" \
  --type boolean

jsn flows add-output "Update Ticket Status" \
  --name error_message \
  --label "Error Message" \
  --type string

# Add actions
jsn flows add-action "Update Ticket Status" \
  --type look_up_record \
  --name "Find Ticket" \
  --table ticket \
  --condition "sys_id={{input.ticket_id}}"

jsn flows add-logic "Update Ticket Status" \
  --type if \
  --condition "{{Find Ticket.Record}}!=" \
  --name "Ticket Found"

jsn flows add-action "Update Ticket Status" \
  --type update_record \
  --name "Update State" \
  --table ticket \
  --input "record_id={{input.ticket_id}}" \
  --input "fields=state={{input.new_state}}^work_notes={{input.work_notes}}"
```

**Success Criteria:**
- [ ] Subflow appears in Flow Designer's subflow picker
- [ ] Can be called from other flows
- [ ] Inputs are properly typed and validated
- [ ] Outputs are returned correctly

#### Scenario 3: Catalog Item Flow
**Goal:** Create a flow attached to a Service Catalog item

**Expected Structure:**
```yaml
Name: Software Procurement Flow
Type: Flow
Associated Catalog Item: Software Request
Trigger:
  Type: Record Created (on sc_req_item)
  Condition: cat_item.name = "Software Request"
Inputs (from catalog variables):
  - software_name: Name of software requested
  - cost_center: User's cost center
  - justification: Business justification
Actions:
  1. Create Approval: Manager approval required
  2. Wait For Condition: Approval state = Approved
  3. If: Approved
     4. Create Task: Procurement team to purchase software
     5. Wait For Condition: Task completed
     6. Create Task: IT team to install software
     7. Update Request Item: State = Closed Complete
     8. Send Email: Requester - Software ready
  9. Else: Rejected
     10. Update Request Item: State = Closed Incomplete
     11. Add Comment: Rejection reason
```

**CLI Commands to Support:**
```bash
# Create the flow (will be associated with catalog item later)
jsn flows create --name "Software Procurement Flow" --type flow

# Add trigger for catalog item
jsn flows add-trigger "Software Procurement Flow" \
  --type record_create \
  --table sc_req_item \
  --condition "cat_item.name=Software Request"

# Create approval
jsn flows add-action "Software Procurement Flow" \
  --type get_approval \
  --name "Manager Approval" \
  --approver "{{trigger.current.requested_for.manager}}"

# Add wait
jsn flows add-action "Software Procurement Flow" \
  --type wait_for_condition \
  --name "Wait for Approval" \
  --condition "approval=approved"

# Add conditional
jsn flows add-logic "Software Procurement Flow" \
  --type if \
  --condition "{{Manager Approval.approval}}=approved" \
  --name "Is Approved"

# Add procurement task
jsn flows add-action "Software Procurement Flow" \
  --type create_task \
  --name "Procure Software" \
  --table sc_task \
  --input "parent={{trigger.current}}" \
  --input "short_description=Procure {{catalog.software_name}}" \
  --input "assignment_group=Procurement"

# Link to catalog item (separate command or automatic)
jsn flows associate-catalog-item "Software Procurement Flow" \
  --catalog-item "Software Request"
```

**Success Criteria:**
- [ ] Flow appears in Catalog Item's Flow field
- [ ] Flow triggers when catalog item is requested
- [ ] Catalog variables are accessible in flow
- [ ] Approval process works end-to-end
- [ ] Request item is updated correctly

### Testing Priority

Implement in this order:
1. **Scenario 2** (Subflow) - Simplest, no trigger needed
2. **Scenario 1** (Ticket Flow) - Basic trigger + actions
3. **Scenario 3** (Catalog Flow) - Most complex, requires catalog integration

### Travel App Flow Implementation Examples

Based on the Project Sybil travel app spec, here are the exact CLI commands needed:

#### Travel Request Approval Flow

```bash
# Create the main approval flow
jsn flows create --name "Travel Request Approval" --type flow

# Add record update trigger
jsn flows add-trigger "Travel Request Approval" \
  --type record_update \
  --table x_demo_travel_request \
  --condition "approval_status=Pending"

# Step 1: Look up delegation
jsn flows add-action "Travel Request Approval" \
  --type look_up_record \
  --name "Find Delegation" \
  --table x_demo_travel_delegation \
  --condition "delegator={{trigger.current.traveler.manager}}^active=true^start_date<=today^end_date>=today"

# Step 2: If delegation exists
jsn flows add-logic "Travel Request Approval" \
  --type if \
  --condition "{{Find Delegation.Record}}!=" \
  --name "Has Delegation"

# Step 3a: Approval from delegate (if delegation found)
jsn flows add-action "Travel Request Approval" \
  --type get_approval \
  --name "Manager Approval" \
  --approver "{{Find Delegation.delegate}}"

# Step 3b: Else approval from manager
jsn flows add-action "Travel Request Approval" \
  --type get_approval \
  --name "Manager Approval" \
  --approver "{{trigger.current.traveler.manager}}"

# Step 4: If approved
jsn flows add-logic "Travel Request Approval" \
  --type if \
  --condition "{{Manager Approval.approval}}=approved" \
  --name "Is Approved"

# Step 4a: Update to Approved
jsn flows add-action "Travel Request Approval" \
  --type update_record \
  --name "Set Approved" \
  --table x_demo_travel_request \
  --input "record_id={{trigger.current.sys_id}}" \
  --input "fields=approval_status=Approved"

# Step 4b: Else rejected
jsn flows add-action "Travel Request Approval" \
  --type update_record \
  --name "Set Rejected" \
  --table x_demo_travel_request \
  --input "record_id={{trigger.current.sys_id}}" \
  --input "fields=approval_status=Rejected"

# Step 4c: Add journal entry with rejection reason
jsn flows add-action "Travel Request Approval" \
  --type add_journal_entry \
  --name "Log Rejection" \
  --table x_demo_travel_request \
  --input "record_id={{trigger.current.sys_id}}" \
  --input "text={{Manager Approval.rejection_reason}}"

# Step 5: If cost exceeds threshold, escalate to finance
jsn flows add-logic "Travel Request Approval" \
  --type if \
  --condition "{{trigger.current.estimated_cost}}>{{policy.finance_threshold}}" \
  --name "Finance Escalation Needed"

# Step 5a: Update status to Finance Review
jsn flows add-action "Travel Request Approval" \
  --type update_record \
  --name "Set Finance Review" \
  --table x_demo_travel_request \
  --input "record_id={{trigger.current.sys_id}}" \
  --input "fields=approval_status=Finance Review"

# Step 5b: Call Finance Escalation subflow
jsn flows add-subflow "Travel Request Approval" \
  --subflow "Finance Escalation" \
  --map "travel_request_id={{trigger.current.sys_id}}"
```

#### Finance Escalation Subflow

```bash
# Create the finance escalation subflow
jsn flows create --name "Finance Escalation" --type subflow

# Add input
jsn flows add-input "Finance Escalation" \
  --name travel_request_id \
  --label "Travel Request ID" \
  --type string \
  --required

# Step 1: Ask for approval from finance role
jsn flows add-action "Finance Escalation" \
  --type get_approval \
  --name "Finance Team Approval" \
  --approver-role "x_demo_travel.finance"

# Step 2: If approved
jsn flows add-logic "Finance Escalation" \
  --type if \
  --condition "{{Finance Team Approval.approval}}=approved" \
  --name "Finance Approved"

# Step 2a: Update to Approved
jsn flows add-action "Finance Escalation" \
  --type update_record \
  --name "Set Finance Approved" \
  --table x_demo_travel_request \
  --input "record_id={{input.travel_request_id}}" \
  --input "fields=approval_status=Approved"

# Step 2b: Else rejected
jsn flows add-action "Finance Escalation" \
  --type update_record \
  --name "Set Finance Rejected" \
  --table x_demo_travel_request \
  --input "record_id={{input.travel_request_id}}" \
  --input "fields=approval_status=Rejected"

# Add outputs
jsn flows add-output "Finance Escalation" \
  --name final_status \
  --label "Final Status" \
  --type string
```

#### Expense Reimbursement Flow

```bash
# Create the expense flow
jsn flows create --name "Expense Reimbursement" --type flow

# Add trigger on expense creation
jsn flows add-trigger "Expense Reimbursement" \
  --type record_create \
  --table x_demo_travel_expense

# Step 1: Look up policy for expense type
jsn flows add-action "Expense Reimbursement" \
  --type look_up_record \
  --name "Get Policy" \
  --table x_demo_travel_policy \
  --condition "applies_to_country={{travel_request.destination_country}}^active=true"

# Step 2: Check if amount exceeds policy
jsn flows add-logic "Expense Reimbursement" \
  --type if \
  --condition "{{trigger.current.amount}}>{{Get Policy.max_daily_{{trigger.current.expense_type}}}}" \
  --name "Exceeds Policy"

# Step 2a: Flag for manual review
jsn flows add-action "Expense Reimbursement" \
  --type update_record \
  --name "Flag for Review" \
  --table x_demo_travel_expense \
  --input "record_id={{trigger.current.sys_id}}" \
  --input "fields=reimbursement_status=Finance Review"

# Step 2b: Else auto-approve
jsn flows add-action "Expense Reimbursement" \
  --type update_record \
  --name "Auto Approve" \
  --table x_demo_travel_expense \
  --input "record_id={{trigger.current.sys_id}}" \
  --input "fields=reimbursement_status=Approved"
```

**Travel App Success Criteria:**
- [ ] Travel Request Approval routes to delegate when active delegation exists
- [ ] Falls back to manager when no delegation
- [ ] Finance escalation triggers for high-cost requests
- [ ] Finance team approval uses role-based approver
- [ ] Expense flow auto-approves within policy, flags exceptions
- [ ] All three flows work together end-to-end

## Phase 6: Error Handling & Validation

### Validation Rules

- [ ] Flow name must be unique (case-insensitive)
- [ ] Table names must exist
- [ ] Action types must be valid
- [ ] Input values must match expected types
- [ ] Required inputs must be provided

### Error Messages

Clear, actionable error messages:
- "Flow 'My Flow' already exists (sys_id: xxx)"
- "Table 'invalid_table' does not exist"
- "Action 'create_record' requires 'table' input"
- "Subflow 'Helper' not found"

### Rollback Strategy

On failure:
- [ ] Delete partially created records
- [ ] Provide cleanup command
- [ ] Log what was created before failure

## Open Questions

1. **Version Management**: Should creating components auto-create a new version?
2. **Activation**: Should flows be activated immediately or left as draft?
3. **Scope**: How to handle cross-scope flow references?
4. **Complex Inputs**: How to handle complex inputs (field mappings, scripts)?
5. **UI**: Should we provide a TUI wizard for complex flows?

## Implementation Order

1. **Phase 1**: Research and document data model
2. **Phase 2.1**: Create empty flows/subflows
3. **Phase 3.1**: Add triggers
4. **Phase 3.2**: Add simple actions (Create, Update)
5. **Phase 5**: Comprehensive testing
6. **Phase 3.3**: Add logic blocks
7. **Phase 3.4**: Add subflow calls
8. **Phase 4**: Templates
9. **Phase 6**: Error handling improvements

## Success Criteria

- [ ] Can create a working flow entirely via CLI
- [ ] Flow appears correctly in ServiceNow Flow Designer
- [ ] Flow executes without errors
- [ ] Can create subflows with inputs/outputs
- [ ] Can call subflows from parent flows
- [ ] Common templates work out of the box

## Resources

- ServiceNow Flow Designer documentation
- ServiceNow Table API reference
- Existing flow JSON structures (from `jsn flows --json`)
- Flow version payload examples
