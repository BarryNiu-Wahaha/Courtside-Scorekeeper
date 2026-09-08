"""Explicit additive schema migration and legacy adoption."""
import argparse
from .repository import MySQLRepository

def main():
    parser=argparse.ArgumentParser();parser.add_argument('command',choices=['migrate']);args=parser.parse_args()
    repository=MySQLRepository.from_env();repository.migrate()
    print(f'Remote schema ready; adopted {repository.adopt_legacy()} legacy games. Existing records preserved.')

if __name__=='__main__':main()
