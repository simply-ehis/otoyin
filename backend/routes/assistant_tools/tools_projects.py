"""Agent tool schemas for project workspaces, plan artifacts, and asset acquisition.

These mirror the REST routes in backend/routes/projects.py and
backend/routes/acquire.py so the assistant can operate on project workspaces
create_project is *not* added here -- that name already maps to the standalone
studio project endpoint in mappings.py; workspace creation uses
create_agent_project to avoid clobbering it.
"""

PROJECT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_projects",
            "description": "List every project workspace currently tracked in the database.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_agent_project",
            "description": "Create a project workspace to group sources, plans, and acquired assets for a working session.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Human-readable project name."},
                    "description": {"type": "string"},
                    "source_url": {
                        "type": "string",
                        "description": "Optional git/URL source to clone into the workspace.",
                    },
                    "checkout_commit": {"type": "string", "description": "Optional commit to check out."},
                    "local_path": {
                        "type": "string",
                        "description": "Optional existing local path (relative to data dir).",
                    },
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_project",
            "description": "Fetch a single project workspace by id.",
            "parameters": {
                "type": "object",
                "properties": {"project_id": {"type": "string"}},
                "required": ["project_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_project_context",
            "description": "Build the per-project context bundle (path roots, sources, plans) used to seed assistant memory for a working session.",
            "parameters": {
                "type": "object",
                "properties": {"project_id": {"type": "string"}},
                "required": ["project_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_project_sources",
            "description": "List the sources attached to a project workspace.",
            "parameters": {
                "type": "object",
                "properties": {"project_id": {"type": "string"}},
                "required": ["project_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_project_source",
            "description": "Attach a new source (URL or local path) to a project workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_id": {"type": "string"},
                    "name": {"type": "string"},
                    "source_type": {"type": "string", "default": "file"},
                    "url": {"type": "string"},
                    "local_path": {"type": "string"},
                },
                "required": ["project_id", "name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_project_plans",
            "description": "List saved plans for a project workspace.",
            "parameters": {
                "type": "object",
                "properties": {"project_id": {"type": "string"}},
                "required": ["project_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_plan",
            "description": "Author a plan artifact (title + ordered steps) under a project workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_id": {"type": "string"},
                    "title": {"type": "string"},
                    "steps": {"type": "array", "items": {"type": "string"}},
                    "status": {"type": "string", "default": "planned"},
                    "plan_id": {"type": "string"},
                },
                "required": ["project_id", "title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_plan",
            "description": "Fetch a single plan artifact by id within a project workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_id": {"type": "string"},
                    "plan_id": {"type": "string"},
                },
                "required": ["project_id", "plan_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "acquire_search",
            "description": "Search free media libraries (freesound, polyhaven) for assets. Returns up to 20 results per source.",
            "parameters": {
                "type": "object",
                "properties": {
                    "source": {"type": "string", "description": "One of: freesound, polyhaven."},
                    "query": {"type": "string"},
                    "limit": {"type": "integer", "default": 20},
                    "asset_type": {"type": "string", "default": "all"},
                },
                "required": ["source", "query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "acquire_download",
            "description": "Download a media asset from a free library into the project assets directory. SSRF and path-traversal are blocked server-side.",
            "parameters": {
                "type": "object",
                "properties": {
                    "source": {"type": "string", "description": "One of: freesound, polyhaven."},
                    "url": {"type": "string"},
                    "asset_id": {"type": "string"},
                    "asset_type": {"type": "string"},
                    "filename": {"type": "string"},
                    "resolution": {"type": "string", "default": "1k"},
                },
                "required": ["source"],
            },
        },
    },
]
