# Copilot Instructions for AI Coding Agents

## Project Overview
This is a simple static website project. The workspace contains HTML, media, and asset files:
- `index.html`, `index1.html`: Main HTML files for the site
- `background.jpg`, `favicon.ico`: Image assets
- `canube.mp3`: Audio asset

There is no build system, package manager, or backend code. All files are served as static assets.

## Key Patterns & Conventions
- **HTML Structure**: The main entry point is `index.html`. Use semantic HTML where possible. 
- **Assets**: Reference images and audio using relative paths (e.g., `<img src="background.jpg">`, `<audio src="canube.mp3">`).
- **No Frameworks**: No JavaScript frameworks or CSS preprocessors are present. Use plain HTML, CSS, and JavaScript if needed.
- **No Build Step**: Changes to files are reflected immediately. No compilation or bundling is required.
- **No Tests**: There are no automated tests or test frameworks in this project.

## Developer Workflows
- **Previewing**: Open `index.html` directly in a browser to preview changes.
- **Adding Assets**: Place new images, audio, or other static files in the root directory. Reference them with relative paths in HTML.
- **Multiple Entry Points**: If both `index.html` and `index1.html` are used, ensure navigation between them is clear (e.g., with anchor tags).

## Project-Specific Guidance
- **Keep It Simple**: Maintain the minimal, static nature of the site. Avoid introducing unnecessary complexity.
- **Accessibility**: Use alt text for images and provide controls for audio elements.
- **Consistency**: Match the style and structure of existing HTML files when adding new content.

## Example
To add a new image:
1. Place `newimage.jpg` in the project root.
2. Reference it in HTML: `<img src="newimage.jpg" alt="Description">`

---

For more information, see the main HTML files in the project root.
