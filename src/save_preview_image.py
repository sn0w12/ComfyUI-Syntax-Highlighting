import os
import json
import random
import numpy as np
import folder_paths
from PIL import Image
from PIL.PngImagePlugin import PngInfo
from comfy.cli_args import args


class SavePreviewImage:
    def __init__(self):
        self.type = "temp"
        self.compress_level = 4
        base_dir = self.get_base_dir()
        self.output_dir = os.path.join(base_dir, "web/images")
        os.makedirs(self.output_dir, exist_ok=True)

        self.temp_output_dir = folder_paths.get_temp_directory()
        self.prefix_append = "_temp_" + "".join(random.choice("abcdefghijklmnopqrstupvxyz") for x in range(5))

    @classmethod
    def get_base_dir(cls):
        dir_path = os.path.dirname(os.path.realpath(__file__))
        if os.path.basename(dir_path) == "src":
            dir_path = os.path.dirname(dir_path)
        return dir_path

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE", {"tooltip": "The images to save."}),
                "name": (
                    "STRING",
                    {"default": "preview", "tooltip": "The filename to save the image as (without extension)"},
                ),
                "overwrite": (
                    "BOOLEAN",
                    {"default": True, "tooltip": "Whether to overwrite existing files with the same name"},
                ),
                "subfolder": (
                    "STRING",
                    {"default": "", "tooltip": "Optional subfolder within the output directory"},
                ),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ()
    FUNCTION = "save_images"

    OUTPUT_NODE = True

    CATEGORY = "image"
    DESCRIPTION = "Saves the input images to the preview directory."

    def save_images(self, images, name="preview", overwrite=True, subfolder="", prompt=None, extra_pnginfo=None):
        results = list()

        # Remove file extension from name if present
        name = os.path.splitext(name)[0]

        # Create output directory with subfolder if specified
        current_output_dir = self.output_dir
        if subfolder:
            current_output_dir = os.path.join(self.output_dir, subfolder)
            os.makedirs(current_output_dir, exist_ok=True)

        full_output_folder, filename, temp_counter, temp_subfolder, filename_prefix = folder_paths.get_save_image_path(
            self.prefix_append, self.temp_output_dir, images[0].shape[1], images[0].shape[0]
        )
        for batch_number, image in enumerate(images):
            i = 255.0 * image.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))

            # Prepare metadata
            metadata = None
            if not hasattr(args, "disable_metadata") or not args.disable_metadata:
                metadata = PngInfo()
                if prompt is not None:
                    metadata.add_text("prompt", json.dumps(prompt))
                if extra_pnginfo is not None:
                    for x in extra_pnginfo:
                        metadata.add_text(x, json.dumps(extra_pnginfo[x]))

            # Create preview filename
            if batch_number > 0:
                file = f"{name}_{batch_number}.png"
            else:
                file = f"{name}.png"

            filepath = os.path.join(current_output_dir, file)

            # Check if file exists and handle overwrite option
            if os.path.exists(filepath) and not overwrite:
                counter = 1
                while os.path.exists(os.path.join(current_output_dir, f"{name}_{counter}.png")):
                    counter += 1
                file = f"{name}_{counter}.png"
                filepath = os.path.join(current_output_dir, file)

            # Save the preview image
            img.save(filepath, pnginfo=metadata, compress_level=self.compress_level)

            # Save temp image
            temp_file = f"{filename_prefix}_{temp_counter}.png"
            img.save(os.path.join(full_output_folder, temp_file), pnginfo=metadata, compress_level=self.compress_level)
            results.append({"filename": temp_file, "subfolder": temp_subfolder, "type": self.type})

        return {"ui": {"images": results}}
