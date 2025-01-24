<h1 align="center">
    ComfyUI Syntax Highlighting
</h1>

Syntax highlighting and other quality of life improvements for ComfyUI.

## Features

-   Multiline textbox syntax highlighting.
    -   Weight highlighting.
    -   Lora highlighting.
        -   Incorrect lora highlighting.
    -   Embedding Highlighting.
        -   Incorrect embedding highlighting.
    -   Duplicate tag highlighting.
    -   Unclosed span highlighting.
-   Favorite combo values.
-   Preview images for combo values.

## Configuration

To get preview images, you have to put them in `../ComfyUI/custom_nodes/ComfyUI-Syntax-Highlighting/web/images`. The name of the image must match the name of the combo value exactly (except the file extension).

To favorite the currently selected combo value, right click the node and click `favorite [name]`, if there are several combo inputs, it will be a submenu with all favorite options inside it.

## Settings

| Setting Name              | Type                     | Description                                                                                           |
| ------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| Textbox Colors            | Multiline text           | List of RGB or HEX colors (one per line) used for syntax highlighting                                 |
| Textbox Highlight Type    | Combo (Strength/Nesting) | Controls highlighting behavior - Strength by the weight and Nesting by the nesting of the parentheses |
| Favorite On Top           | Boolean                  | When enabled, places favorite items at the top of lists                                               |
| Combo Highlight Color     | Color picker             | Sets the highlight color for combo box items                                                          |
| Preview Image Hover Delay | Slider (0-1000ms)        | Delay before showing preview images on hover                                                          |
| Preview Image Padding     | Slider (0-100px)         | Padding around preview images                                                                         |
| Preview Image Side        | Combo (Left/Right)       | Which side preview images appear on                                                                   |
| Preview Image Size        | Slider (100-1000px)      | Size of preview images                                                                                |

## Examples

### Textbox Highlighting

![Textbox](https://i.imgur.com/UzYnqew.png)

### Favorite Combo Value

![Combo](https://i.imgur.com/nohMc2U.png)

### Preview Image

![Preview](https://i.imgur.com/DCrpAT8.png)
