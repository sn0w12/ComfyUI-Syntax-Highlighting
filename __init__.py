import json
import os
import re
from pathlib import Path
from urllib.parse import quote
import folder_paths
from server import PromptServer
from aiohttp import web
import aiohttp

from .src.config_reader import ConfigReader
from .src.save_preview_image import SavePreviewImage
from .src.util import get_preview_image_path

WEB_DIRECTORY = "./web"
API_PREFIX = "/SyntaxHighlighting"
NODE_PREFIX = "SyntaxHighlighting_"
NODE_CLASS_MAPPINGS = {
    f"{NODE_PREFIX}SavePreviewImage": SavePreviewImage,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    f"{NODE_PREFIX}SavePreviewImage": "Save Preview Image",
}


image_index = {}


def load_image_index():
    images_dir = Path(get_preview_image_path())
    json_path = images_dir.joinpath("images.json")
    if not json_path.exists():
        return {}
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {img["filename"]: img["path"] for img in data.get("images", [])}


def reload_image_index():
    global image_index
    image_index.clear()
    image_index.update(load_image_index())


def index_images():
    """
    Create a JSON index of all images in the web/images directory and its subfolders.
    """
    try:
        images_dir = Path(get_preview_image_path())
        if not images_dir.exists():
            print(f"Warning: Directory not found: {images_dir}")
            return {"success": False}

        image_files = []
        for ext in [".png", ".jpg", ".jpeg", ".webp"]:
            image_files.extend(images_dir.rglob(f"*{ext}"))
        print(f"Found {len(image_files)} images in {images_dir}")

        images = []
        for img_path in image_files:
            images.append(
                {
                    "filename": img_path.stem,
                    "path": str(img_path),
                }
            )

        output = {"images": images, "count": len(images)}
        json_path = images_dir.joinpath("images.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2)

        print(f"Created index with {len(images)} images at {json_path}")
        return_data = {"success": True, "count": len(images)}
        reload_image_index()
        return return_data

    except Exception as e:
        print(f"Error creating image index: {str(e)}")
        return {"success": False}


index_images()


@PromptServer.instance.routes.get(f"{API_PREFIX}/loras")
async def get_loras(request):
    loras = folder_paths.get_filename_list("loras")
    return web.json_response(list(map(lambda a: os.path.splitext(a)[0], loras)))


@PromptServer.instance.routes.get(f"{API_PREFIX}/embeddings")
async def get_embeddings(request):
    embeddings = folder_paths.get_filename_list("embeddings")
    return web.json_response(list(map(lambda a: os.path.splitext(a)[0], embeddings)))


@PromptServer.instance.routes.get(f"{API_PREFIX}/enabled")
async def get_enabled(request):
    return web.json_response({"enabled": True})


@PromptServer.instance.routes.get(f"{API_PREFIX}/index")
async def index_images_endpoint(request):
    data = index_images()
    reload_image_index()
    return web.json_response(data)


@PromptServer.instance.routes.get(f"{API_PREFIX}/favorites")
async def favorites_endpoint(request):
    favorites = ConfigReader.get_setting("SyntaxHighlighting.favorites", [])
    return web.json_response({"favorites": favorites})


@PromptServer.instance.routes.get(f"{API_PREFIX}/images_json")
async def serve_images_json(request):
    images_dir = Path(get_preview_image_path())
    json_path = images_dir.joinpath("images.json")
    if json_path.exists():
        return web.FileResponse(path=json_path)
    return web.Response(status=404, text="images.json not found")


@PromptServer.instance.routes.get(f"{API_PREFIX}/images/{{filename}}")
async def serve_image(request):
    filename = request.match_info["filename"]
    if not filename:
        return web.Response(status=400, text="Filename is required")

    img_path = image_index.get(filename)
    if img_path and Path(img_path).exists():
        return web.FileResponse(path=img_path)
    return web.Response(status=404, text="Image not found")


@PromptServer.instance.routes.get(f"{API_PREFIX}/wiki/{{tag}}")
async def fetch_wiki_page(request):
    """
    Proxy endpoint to fetch Danbooru wiki pages.
    This avoids CSP violations by making the request server-side.
    Uses the official JSON API instead of scraping HTML, which is
    blocked by Cloudflare bot protection (HTTP 403) for Python clients.
    """
    tag = request.match_info["tag"]
    if not tag:
        return web.Response(status=400, text="Tag is required")

    # Clean the tag similar to frontend logic
    tag = tag.strip()

    api_url = "https://danbooru.donmai.us/wiki_pages.json"
    headers = {
        # Danbooru requires API consumers to identify themselves.
        "User-Agent": "ComfyUI-Syntax-Highlighting/1.0",
        "Accept": "application/json",
    }

    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get(api_url, params={"search[title]": tag},
                                   timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status != 200:
                    return web.json_response({
                        "success": False,
                        "error": {
                            "status": response.status,
                            "message": f"HTTP error! status: {response.status}",
                            "url": f"{api_url}?search[title]={quote(tag)}",
                        }
                    })
                pages = await response.json()
                page = _find_wiki_page(pages, tag)
                if page is None:
                    return web.json_response({
                        "success": False,
                        "error": {
                            "status": 404,
                            "message": "Wiki page not found",
                            "url": f"{api_url}?search[title]={quote(tag)}",
                        }
                    })
                body = page.get("body") or ""
                return web.json_response({
                    "success": True,
                    "data": {
                        "title": page.get("title"),
                        "body": body,
                        "description": _extract_wiki_description(body),
                    }
                })
    except aiohttp.ClientError as e:
        return web.json_response({ "success": False, "error": { "message": str(e), "url": api_url, }
        }, status=500)
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": {
                "message": f"Unexpected error: {str(e)}",
                "url": api_url,
            }
        }, status=500)


def _find_wiki_page(pages, tag):
    """Prefer the exact title match, fall back to the first result."""
    if not pages:
        return None
    lowered = tag.lower()
    for page in pages:
        if isinstance(page, dict) and str(page.get("title", "")).lower() == lowered:
            return page
    return pages[0] if isinstance(pages[0], dict) else None


def _extract_wiki_description(body):
    """Extract the first paragraph of a Danbooru DText wiki body."""
    if not body:
        return None
    text = body.replace("\r\n", "\n").strip()
    if not text:
        return None
    paragraphs = [p.strip() for p in text.split("\n\n")]
    first = next((p for p in paragraphs if p), "")
    if not first:
        return None
    # Unwrap DText wiki links: [[target|label]] -> label, [[target]] -> target
    first = re.sub(r"\[\[([^|\]]+)\|([^\]]+)\]\]", r"\2", first)
    first = re.sub(r"\[\[([^\]]+)\]\]", r"\1", first)
    lines = []
    for line in first.split("\n"):
        line = re.sub(r"^(h[1-6]\.\s*|[*#\s]+)", "", line).strip()
        if line:
            lines.append(line)
    description = " ".join(lines).strip()
    return description or None
