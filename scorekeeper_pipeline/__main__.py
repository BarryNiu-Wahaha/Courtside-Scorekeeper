"""Run with: conda run --no-capture-output -n msba python -m scorekeeper_pipeline ..."""
import argparse
import getpass
import json
import os
import sys
from .validation import ValidationError, read_csv
from .roster import read_roster, read_participation

def parser():
    result=argparse.ArgumentParser(description='Validate and import CourtSide event CSVs into MySQL.')
    commands=result.add_subparsers(dest='command',required=True)
    validate=commands.add_parser('validate',help='Validate a whole CSV without connecting to MySQL')
    validate.add_argument('file')
    for name in ('validate-roster','validate-participation'):
        commands.add_parser(name,help='Validate CSV without connecting to MySQL').add_argument('file')
    for name,description in [('init-db','Create database/tables if absent (never drops data)'),('migrate-db','Add roster and participation support to existing tables'),('import-roster','Preview roster changes; add --apply to save'),('import-participation','Import a game participation snapshot'),('import','Validate and import one game atomically'),('summary','Query an imported game score')]:
        command=commands.add_parser(name,help=description)
        command.add_argument('--host',default=os.environ.get('MYSQL_HOST','localhost'))
        command.add_argument('--port',type=int,default=os.environ.get('MYSQL_PORT','3306'))
        command.add_argument('--user',default=os.environ.get('MYSQL_USER','root'))
        command.add_argument('--database',default=os.environ.get('MYSQL_DATABASE','scorekeeper'))
        if name in ('import','import-roster','import-participation'):command.add_argument('file')
        if name=='import-roster':command.add_argument('--apply',action='store_true',help='Explicitly apply the roster changes after reviewing a preview')
        if name=='summary':command.add_argument('game_id')
    return result

def main(argv=None):
    args=parser().parse_args(argv)
    try:
        # A malformed file never reaches credentials, the database, or schema initialization.
        batch=read_csv(args.file) if args.command in ('validate','import') else None
        rows=read_roster(args.file) if args.command in ('validate-roster','import-roster') else read_participation(args.file) if args.command in ('validate-participation','import-participation') else None
        if args.command in ('validate-roster','validate-participation'):
            print(f'Valid: {len(rows)} rows. No database connection made.');return 0
        if args.command=='validate':
            print(f'Valid: {len(batch.events)} events for {batch.events[0].game_id}; {batch.normalized_fields} fields normalized. No database connection made.')
            return 0
        from .database import Config, ImportConflict, import_batch, initialize, summary, migrate, import_roster, import_participation
        import pymysql
        password=os.environ.get('MYSQL_PASSWORD')
        if password is None:
            if not sys.stdin.isatty():
                raise ValueError('Run this command in your own terminal for a hidden password prompt, or set MYSQL_PASSWORD locally. No password argument is accepted.')
            password=getpass.getpass(f'MySQL password for {args.user}@{args.host}:{args.port}: ')
        config=Config(host=args.host,port=args.port,user=args.user,password=password,database=args.database)
        try:
            if args.command=='init-db':
                initialize(config)
                print(f'Ready: {config.database} on {config.host}:{config.port}. Tables: games, players, events, game_participation, participation_snapshots. Existing installations should run migrate-db.')
            elif args.command=='migrate-db':
                migrate(config);print('Additive roster/participation migration complete; existing data preserved.')
            elif args.command=='import-roster':
                print(json.dumps(import_roster(config,rows,apply=args.apply),ensure_ascii=False,indent=2,default=str))
                print('Roster committed.' if args.apply else 'Preview only. To save these changes, repeat with --apply.')
            elif args.command=='import-participation':
                print('Participation '+import_participation(config,rows)+'.')
            elif args.command=='import':
                result=import_batch(config,batch)
                print(f'Committed {result.game_id}: {result.inserted} inserted, {result.voided} newly voided, {result.unchanged} unchanged; {result.stale_voids} stale void reversals ignored. {batch.normalized_fields} fields normalized.')
            else:
                row=summary(config,args.game_id)
                if row is None:raise ValueError(f'No imported game found with ID {args.game_id}.')
                print(json.dumps(row,default=str,ensure_ascii=False,indent=2))
        except ImportConflict as error:
            print(str(error),file=sys.stderr);return 2
        except pymysql.Error as error:
            code=error.args[0] if error.args else 'unknown'
            message=error.args[1] if len(error.args)>1 else 'Database operation failed.'
            print(f'MySQL error {code}: {message}',file=sys.stderr)
            if args.command=='import':print('Import not committed. Check credentials/schema and retry.',file=sys.stderr)
            return 3
        return 0
    except (ValidationError,ValueError,OSError,EOFError) as error:
        print(str(error),file=sys.stderr);return 2
    except KeyboardInterrupt:
        print('Cancelled.',file=sys.stderr);return 130

if __name__=='__main__':sys.exit(main())
