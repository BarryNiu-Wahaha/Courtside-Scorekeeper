"""Run explicitly to prepare the optional analytics database; never prints secrets."""
from .visitor_repository import MongoVisitorRepository

def main():
    repo = None
    try:
        repo=MongoVisitorRepository.from_env()
        if repo is None: raise RuntimeError()
        repo.setup()
        print('Visitor collection and indexes ready.')
    except Exception:
        raise SystemExit('Visitor setup failed. Check private configuration, access and database availability.') from None
    finally:
        if repo: repo.client.close()

if __name__=='__main__': main()
