import os
import json
import folder_paths


class ConfigReader:
    """
    Handles reading and managing configuration settings for ComfyUI without using the API.

    Methods:
    get_setting(setting_id, default)
        Retrieve a setting value from the configuration file.

    is_comfy_portable()
        Check if comfy is running in portable mode.
    """

    user_directory = folder_paths.get_user_directory()
    SETTINGS_PATH = os.path.join(user_directory, "default/comfy.settings.json")

    @classmethod
    def log(cls, message, color="\033[0;35m"):
        """Print a message with a specific color prefix."""
        print(f"{color}[SyntaxHighlight] \033[0m{message}")

    @staticmethod
    def get_setting(setting_id, default=None):
        """Retrieve a setting value from the configuration file."""
        try:
            with open(ConfigReader.SETTINGS_PATH, "r", encoding="utf-8") as file:
                settings = json.load(file)
            return settings.get(setting_id, default)
        except FileNotFoundError:
            ConfigReader.log(f"Local configuration file not found at {ConfigReader.SETTINGS_PATH}.", "\033[0;33m")
        except json.JSONDecodeError:
            ConfigReader.log(f"Error decoding JSON from {ConfigReader.SETTINGS_PATH}.", "\033[0;31m")

        return default

    @staticmethod
    def set_setting(setting_id: str, value):
        """Set a setting value in the configuration file."""
        path = ConfigReader.SETTINGS_PATH

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
