// ServiceNow runtime context: current user, scope, update set

export async function getCurrentUser(sdk) {
  const params = new URLSearchParams();
  params.set('sysparm_query', 'user_name=javascript:gs.getUserName()');
  params.set('sysparm_limit', '1');
  params.set('sysparm_display_value', 'all');
  params.set('sysparm_fields', 'sys_id,user_name,name');
  const records = await sdk.list('sys_user', params);
  if (records.length === 0) return null;
  const r = records[0];
  return {
    sys_id: r.sys_id?.value || r.sys_id,
    user_name: r.user_name?.display_value || r.user_name,
    name: r.name?.display_value || r.name,
  };
}

export async function getCurrentApplication(sdk, userSysID) {
  const params = new URLSearchParams();
  params.set('sysparm_query', `user=${userSysID}^name=apps.current_app`);
  params.set('sysparm_limit', '1');
  params.set('sysparm_fields', 'value');
  const records = await sdk.list('sys_user_preference', params);
  if (records.length === 0) return { scope: 'global' };
  const val = records[0].value?.value || records[0].value;
  if (!val) return { scope: 'global' };

  // Try to resolve sys_id to scope name
  try {
    const app = await sdk.get('sys_scope', val);
    if (app) return { scope: app.scope || 'global' };
  } catch {
    // fallback
  }
  try {
    const app2 = await sdk.get('sys_app', val);
    if (app2) return { scope: app2.scope || 'global' };
  } catch {
    // fallback
  }
  return { scope: val };
}

export async function getCurrentUpdateSet(sdk, userSysID) {
  const params = new URLSearchParams();
  params.set('sysparm_query', `user=${userSysID}^name=sys_update_set`);
  params.set('sysparm_limit', '1');
  params.set('sysparm_fields', 'value');
  const records = await sdk.list('sys_user_preference', params);
  if (records.length === 0) return null;
  const val = records[0].value?.value || records[0].value;
  if (!val || val === '-') return { name: 'Default', sys_id: '' };

  try {
    const us = await sdk.get('sys_update_set', val);
    if (us) return { name: us.name || val, sys_id: val };
  } catch {
    // fallback
  }
  return { name: val, sys_id: val };
}
