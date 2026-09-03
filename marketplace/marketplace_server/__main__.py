"""Entry point: python -m marketplace_server"""

import uvicorn

from marketplace_server.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "marketplace_server.app:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
