import { formatRecordForDisplay } from '../helpers.js';

export function groupRolesCmd(wrap) {
  return {
    command: 'grouproles [subcommand]',
    aliases: ['grouprole', 'grole', 'gr'],
    describe: 'Manage group roles',
    builder: (yargs) => {
      return yargs
        .command({
          command: 'list',
          aliases: ['ls'],
          describe: 'List group roles',
          builder: (y) => y
            .option('query', { type: 'string', describe: 'Encoded query (e.g. "nameLIKEincident" or "active=true")' })
            .option('columns', { alias: 'c', type: 'string', describe: 'Comma-separated columns (e.g. "number,short_description")' })
            .option('limit', { alias: 'l', type: 'number', default: 20, describe: 'Max records' }),
          handler: wrap(async (argv, app) => {
            const columns = argv.columns ? argv.columns.split(',') : ['group.name', 'role.name'];
            const params = new URLSearchParams();
            params.set('sysparm_limit', String(argv.limit));
            params.set('sysparm_display_value', 'all');
            params.set('sysparm_fields', ['sys_id', ...columns].join(','));
            if (argv.query) params.set('sysparm_query', argv.query);
            const records = await app.sdk.list('sys_group_has_role', params);
            app.ok({
              table: 'sys_group_has_role',
              count: records.length,
              columns,
              records: records.map(r => formatRecordForDisplay(r, columns)),
              context: { instance_url: app.getEffectiveInstance() },
            }, { summary: `${records.length} group role(s)` });
          }),
        })

    },
    handler: () => {},
  };
}
