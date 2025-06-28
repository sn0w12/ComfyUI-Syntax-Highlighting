import json
import os
from pathlib import Path
import folder_paths
from server import PromptServer
from aiohttp import web

from .src.config_reader import ConfigReader
from .src.save_preview_image import SavePreviewImage

WEB_DIRECTORY = "./web"
API_PREFIX = "/SyntaxHighlighting"
NODE_PREFIX = "SyntaxHighlighting_"
NODE_CLASS_MAPPINGS = {
    f"{NODE_PREFIX}SavePreviewImage": SavePreviewImage,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    f"{NODE_PREFIX}SavePreviewImage": "Save Preview Image",
}


def index_images():
    """
    Create a JSON index of all images in the web/images directory and its subfolders.
    """
    try:
        # Get the script's directory and construct path to images using Path
        script_dir = Path(os.path.dirname(os.path.realpath(__file__)))
        images_dir = script_dir.joinpath("web", "images")

        # Ensure directory exists
        if not images_dir.exists():
            print(f"Warning: Directory not found: {images_dir}")
            return False

        # Get all image files recursively
        image_files = []
        for ext in [".png", ".jpg", ".jpeg", ".webp"]:
            image_files.extend(images_dir.rglob(f"*{ext}"))

        # Create image entries
        images = []
        for img_path in image_files:
            images.append(
                {
                    "filename": img_path.stem,
                    "path": str(img_path.relative_to(script_dir)).replace(
                        "web", "extensions\\ComfyUI-Syntax-Highlight"
                    ),
                }
            )

        # Create output data
        output = {"images": images, "count": len(images)}

        # Write JSON file
        json_path = images_dir.joinpath("images.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2)

        print(f"Created index with {len(images)} images at {json_path}")
        return True

    except Exception as e:
        print(f"Error creating image index: {str(e)}")
        return False


# Create image index
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
    success = index_images()
    return web.json_response({"success": success})


@PromptServer.instance.routes.get(f"{API_PREFIX}/favorites")
async def favorites_endpoint(request):
    favorites = ConfigReader.get_setting("SyntaxHighlighting.favorites", [])
    return web.json_response({"favorites": favorites})
