export function evalCmd(wrap) {
  return {
    command: 'eval',
    describe: 'Execute background scripts (eval)',
    builder: (yargs) => {
      return yargs
        .option('script', { alias: 's', type: 'string', describe: 'JavaScript code to execute (required)', demandOption: true });
    },
    handler: wrap(async (argv, app) => {
      app.ok({
        status: 'stub',
        message: 'Background script execution is not yet implemented',
        script: argv.script,
      }, { summary: 'Background script execution (stub)' });
    }),
  };
}
