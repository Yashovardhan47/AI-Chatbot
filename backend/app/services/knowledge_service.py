import base64
import hashlib
import io
import json
import zipfile
from pathlib import PurePosixPath
from xml.etree import ElementTree
from app.core.config import settings
from app.models.workspace import KnowledgeDocument, EvidenceChunk
from app.services.memory_logic import rank_memories, fingerprint
from app.services.embeddings import hybrid_rank
from pymongo.errors import DuplicateKeyError
from app.services.memory_guard import memory_write_guard
from app.services.workspace_write import require_actor


def parse_file(filename, content):
    suffix = PurePosixPath(filename.replace("\\", "/")).suffix.lower()
    if suffix == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content), strict=True)
        if reader.is_encrypted or len(reader.pages) > 100:
            raise ValueError("Use an unencrypted PDF with at most 100 pages")
        pages = []
        for number, page in enumerate(reader.pages, 1):
            stream = page.get_contents()
            if stream and len(stream.get_data()) > 2_000_000:
                raise ValueError("PDF page exceeds the extraction limit")
            pages.append((number, page.extract_text() or ""))
            if sum(len(text) for _, text in pages) > settings.MAX_KNOWLEDGE_CHARS:
                raise ValueError("Document exceeds the text limit")
        return pages, "application/pdf"
    if suffix == ".docx":
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            if sum(info.file_size for info in archive.infolist()) > 10_000_000:
                raise ValueError("DOCX expands beyond the supported size")
            root = ElementTree.fromstring(archive.read("word/document.xml"))
            paragraphs = root.findall(".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p")
            text = "\n".join("".join(p.itertext()) for p in paragraphs)
        return [(None, text)], "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if suffix not in {".txt", ".md", ".csv", ".tsv", ".json", ".log"}:
        raise ValueError("Supported files: PDF, DOCX, TXT, Markdown, CSV, TSV, JSON and text logs")
    text = content.decode("utf-8-sig")
    if "\x00" in text:
        raise ValueError("Use a UTF-8 text file")
    if suffix == ".json":
        json.loads(text)
    return [(None, text)], "text/plain"


def make_chunks(pages):
    if sum(len(text) for _, text in pages) > settings.MAX_KNOWLEDGE_CHARS:
        raise ValueError("Document exceeds the text limit")
    result = []
    for page, text in pages:
        text = text.strip(); start = 0
        while start < len(text):
            end = min(start+1000, len(text))
            if end < len(text):
                boundary = text.rfind(" ", start+600, end)
                if boundary > start:
                    end = boundary
            if text[start:end].strip():
                result.append(EvidenceChunk(ordinal=len(result)+1, text=text[start:end].strip(), page=page))
            if end == len(text):
                break
            start = max(start+1, end-100)
    if not result:
        raise ValueError("No readable text. Scanned PDFs need OCR before import.")
    return result


def summary(document):
    return {"id": str(document.id), "title": document.title, "filename": document.filename,
            "project_id": document.project_id, "text_chars": document.text_chars, "chunks": len(document.chunks),
            "indexed_chunks": sum(bool(chunk.embedding) for chunk in document.chunks), "created_at": document.created_at}


async def _store_document(user_id, title, pages, content, filename, media_type, project_id=None):
    key = {"user_id": user_id, "project_id": project_id, "checksum": hashlib.sha256(content).hexdigest()}
    existing = await KnowledgeDocument.find_one(key)
    if existing:
        return existing, False
    if await KnowledgeDocument.find({"user_id": user_id}).count() >= settings.MAX_DOCUMENTS_PER_USER:
        raise ValueError("Knowledge library is full; delete a document before importing another")
    chunks = make_chunks(pages)
    document = KnowledgeDocument(**key, title=title.strip(), filename=filename, media_type=media_type,
        original_base64=base64.b64encode(content).decode(), text_chars=sum(len(text) for _, text in pages), chunks=chunks)
    try:
        await document.insert()
    except DuplicateKeyError:
        return await KnowledgeDocument.find_one(key), False
    return document, True


async def store_document(user_id, title, pages, content, filename, media_type, project_id=None, auth_version=None):
    async with memory_write_guard(user_id):
        await require_actor(user_id, auth_version)
        return await _store_document(user_id, title, pages, content, filename, media_type, project_id)


async def retrieve_documents(user_id, query, project_id=None, document_id=None, limit=4):
    scope = {"user_id": user_id, "project_id": {"$in": [None, project_id]}}
    if document_id:
        from beanie import PydanticObjectId
        scope["_id"] = PydanticObjectId(document_id)
    documents = await KnowledgeDocument.get_motor_collection().find(scope, {"original_base64": 0}).to_list(length=None)
    records = []
    for doc in documents:
        for chunk in doc["chunks"]:
            records.append({"id": chunk["id"], "document_id": str(doc["_id"]), "title": doc["title"],
                "ordinal": chunk["ordinal"], "page": chunk.get("page"), "fact": chunk["text"],
                "project_id": doc.get("project_id"), "created_at": doc["created_at"], "provenance": "user",
                "confirmed": True, "embedding": chunk.get("embedding", []), "embedding_model": chunk.get("embedding_model", ""),
                "embedding_fingerprint": fingerprint(chunk["text"])})
    ranked, mode = await hybrid_rank(records, query, rank_memories(records, query, project_id))
    return {"used": [{key: hit[key] for key in ("id", "document_id", "title", "ordinal", "page", "fact", "score", "reason")}
                     | {"kind": "document", "version": 1} for hit in ranked[:limit]], "retrieval_mode": mode}
