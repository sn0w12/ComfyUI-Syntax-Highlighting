import os
from .config_reader import ConfigReader


def get_preview_image_path():
    path: str = ConfigReader.get_setting("SyntaxHighlighting.preview-image-save-path", "./web/images")
    base_dir = get_base_dir()

    if path.startswith("./"):
        path = os.path.join(base_dir, path[2:])
    else:
        path = os.path.abspath(path)

    return path


def get_base_dir():
    dir_path = os.path.dirname(os.path.realpath(__file__))
    if os.path.basename(dir_path) == "src":
        dir_path = os.path.dirname(dir_path)
    return dir_path
