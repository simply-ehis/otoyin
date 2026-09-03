"""Assistant tool schemas for file I/O — read, transcribe, compact, list supported types."""

FILE_IO_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a text file (.md, .txt) and return its contents. Files are automatically compacted if too large. Use this for reading scripts, notes, or reference documents.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Server-side path to the file to read"},
                    "max_tokens": {
                        "type": "integer",
                        "description": "Maximum tokens to return from the file. Leave empty for automatic sizing based on the model's context window.",
                    },
                    "compact": {
                        "type": "boolean",
                        "default": True,
                        "description": "Whether to compact whitespace and truncate if too large",
                    },
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_pdf",
            "description": "Extract text from a PDF document (.pdf). Returns all page text concatenated. Useful for reading documentation, books, or reports.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Server-side path to the PDF file"},
                    "max_pages": {
                        "type": "integer",
                        "default": 50,
                        "description": "Maximum number of pages to extract",
                    },
                    "compact": {
                        "type": "boolean",
                        "default": True,
                        "description": "Whether to compact the extracted text",
                    },
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_epub",
            "description": "Extract text from an EPUB ebook (.epub). Returns all chapter text concatenated. Useful for reading long-form content like novels or manuals.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Server-side path to the EPUB file"},
                    "compact": {
                        "type": "boolean",
                        "default": True,
                        "description": "Whether to compact the extracted text",
                    },
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "transcribe_file",
            "description": "Transcribe an audio file (.wav, .mp3, .flac, .m4a, .ogg) to text using Whisper STT. Returns the full transcript with word-level timestamps.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string", "description": "Server-side path to the audio file"},
                    "language": {"type": "string", "description": "Optional language code (e.g. 'en', 'zh', 'ja')"},
                    "model": {
                        "type": "string",
                        "default": "base",
                        "description": "Whisper model size: base, small, medium, large, turbo",
                    },
                    "include_timestamps": {
                        "type": "boolean",
                        "default": True,
                        "description": "Include word-level timestamps in the output",
                    },
                    "compact": {"type": "boolean", "default": True, "description": "Compact the transcript whitespace"},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compact_text",
            "description": "Compact and clean text content by removing excessive whitespace, truncating to a token limit, and preserving meaningful structure. Returns the compacted text with a flag indicating if truncation occurred.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "The text content to compact"},
                    "max_tokens": {
                        "type": "integer",
                        "description": "Maximum tokens to keep. Leave empty for automatic sizing based on the model's context window.",
                    },
                    "preserve_start_end": {
                        "type": "boolean",
                        "default": True,
                        "description": "Keep beginning and end of text when truncating",
                    },
                },
                "required": ["text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_supported_files",
            "description": "List files in a directory that are supported by the assistant (.md, .txt, .pdf, .epub). Returns filename, extension, size, and whether the file can be read.",
            "parameters": {
                "type": "object",
                "properties": {
                    "directory": {"type": "string", "description": "Directory path to scan"},
                    "recursive": {
                        "type": "boolean",
                        "default": False,
                        "description": "Scan subdirectories recursively",
                    },
                },
                "required": ["directory"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "validate_file",
            "description": "Validate a file path: check that it exists, is a supported type (.md, .txt, .pdf, .epub), and is within the size limit. Returns validation status and metadata.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to the file to validate"},
                },
                "required": ["path"],
            },
        },
    },
]
