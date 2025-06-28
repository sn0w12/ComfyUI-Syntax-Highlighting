import os
import json


class ConfigReader:
    """
    Handles reading and managing configuration settings for ComfyUI without using the API.

    Methods:
    get_setting(setting_id, default)
        Retrieve a setting value from the configuration file.

    is_comfy_portable()
        Check if comfy is running in portable mode.
    """

    DEFAULT_PATH = os.path.abspath(os.path.join(os.getcwd(), "user/default/comfy.settings.json"))
    PORTABLE_PATH = os.path.abspath(os.path.join(os.getcwd(), "ComfyUI/user/default/comfy.settings.json"))

    portable = "unset"

    @classmethod
    def log(cls, message, color="\033[0;35m"):
        """Print a message with a specific color prefix."""
        print(f"{color}[SyntaxHighlight] \033[0m{message}")

    @classmethod
    def _get_path(cls):
        return ConfigReader.PORTABLE_PATH if ConfigReader.portable else ConfigReader.DEFAULT_PATH

    @classmethod
    def is_comfy_portable(cls):
        """Check if the application is running in portable mode."""
        if cls.portable != "unset" and cls.portable is not None:
            return cls.portable

        # Check if default exists
        if os.path.isfile(cls.DEFAULT_PATH):
            cls.portable = False
            ConfigReader.log("Running standalone comfy.")
            return False

        # Check if portable exists
        if os.path.isfile(cls.PORTABLE_PATH):
            cls.portable = True
            ConfigReader.log("Running portable comfy.")
            return True

        # If neither exist
        ConfigReader.log("Could not find comfy settings.")
        return None

    @staticmethod
    def get_setting(setting_id, default=None):
        """Retrieve a setting value from the configuration file."""
        if ConfigReader.portable == "unset":
            ConfigReader.is_comfy_portable()

        if ConfigReader.portable is None:
            ConfigReader.log(
                f"Local configuration file not found at either {ConfigReader.PORTABLE_PATH} or {ConfigReader.DEFAULT_PATH}.",
                "\033[0;33m",
            )
            return default

        path = ConfigReader._get_path()

        # Try to read the settings from the determined path
        try:
            with open(path, "r", encoding="utf-8") as file:
                settings = json.load(file)
            return settings.get(setting_id, default)
        except FileNotFoundError:
            ConfigReader.log(f"Local configuration file not found at {path}.", "\033[0;33m")
        except json.JSONDecodeError:
            ConfigReader.log(f"Error decoding JSON from {path}.", "\033[0;31m")

        return default

    @staticmethod
    def set_setting(setting_id: str, value):
        """Set a setting value in the configuration file."""
        # Determine the correct path based on the portable attribute
        if ConfigReader.portable is None:
            ConfigReader.log(
                f"Local configuration file not found at either {ConfigReader.PORTABLE_PATH} or {ConfigReader.DEFAULT_PATH}.",
                "\033[0;33m",
            )
            return False

        path = ConfigReader._get_path()

        # Try to read the existing settings from the determined path
        try:
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as file:
                    settings = json.load(file)
            else:
                settings = {}  # If the file doesn't exist, start with an empty dict

            # If value is None, remove the setting if it exists
            if value is None:
                if setting_id in settings:
                    del settings[setting_id]
            else:
                # Update the setting value
                settings[setting_id] = value

            # Write the updated settings back to the file
            with open(path, "w", encoding="utf-8") as file:
                json.dump(settings, file, indent=4)

            return True

        except FileNotFoundError:
            ConfigReader.log(f"Local configuration file not found at {path}.", "\033[0;33m")
        except json.JSONDecodeError:
            ConfigReader.log(f"Error decoding JSON from {path}.", "\033[0;31m")
        except IOError as e:
            ConfigReader.log(f"Error writing to {path}: {e}", "\033[0;31m")

        return False
