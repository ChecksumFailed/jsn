import { formatRecordForDisplay } from '../helpers.js';

export function groupMembersCmd(wrap) {
  return {
    command: 'groupmembers [subcommand]',
    aliases: ['groupmember', 'gmember', 'gm'],
    describe: 'Manage group memberships',
    builder: (yargs) => {
      return yargs
        .command({
          command: 'list',
          aliases: ['ls'],
          describe: 'List group members',
          builder: (y) => y
            .option('query', { type: 'string', describe: 'Encoded query string' })
            .option('columns', { alias: 'c', type: 'string', describe: 'Comma-separated columns' })
            .option('limit', { alias: 'l', type: 'number', default: 20, describe: 'Max records' }),
          handler: wrap(async (argv, app) => {
            const columns = argv.columns ? argv.columns.split(',') : ['user.name', 'group.name'];
            const params = new URLSearchParams();
            params.set('sysparm_limit', String(argv.limit));
            params.set('sysparm_display_value', 'all');
            params.set('sysparm_fields', ['sys_id', ...columns].join(','));
            if (argv.query) params.set('sysparm_query', argv.query);
            const records = await app.sdk.list('sys_user_grmember', params);
            app.ok({
              table: 'sys_user_grmember',
              count: records.length,
              columns,
              records: records.map(r => formatRecordForDisplay(r, columns)),
              context: { instance_url: app.getEffectiveInstance() },
            }, { summary: `${records.length} group member(s)` });
          }),
        })

    },
    handler: () => {},
  };
}
