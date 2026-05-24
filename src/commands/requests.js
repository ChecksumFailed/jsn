import { buildTicketCommands } from './_ticket.js';

const requestDefaultColumns = ['number', 'short_description', 'stage', 'assigned_to'];

export function requestsCmd(wrap) {
  return buildTicketCommands('sc_req_item', 'requests', 'req', requestDefaultColumns, {}, null, wrap);
}
