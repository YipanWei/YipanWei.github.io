# Personal Website

This repository contains a static personal website that can be deployed with
GitHub Pages.

## Files

- `index.html`: page structure and text content
- `styles.css`: visual design and responsive layout
- `script.js`: small interactions and footer year
- `.github/workflows/deploy.yml`: GitHub Pages deployment workflow

## How to customize

1. Replace placeholder text in `index.html`.
2. Update the contact links in the contact section.
3. If needed, change colors and spacing in `styles.css`.

## How to deploy

1. Create a GitHub repository.
2. If you want the site at the root domain, name the repository
   `<your-github-username>.github.io`.
3. Push this project to the `main` branch.
4. Example commands:

   ```bash
   git remote add origin git@github.com:<your-github-username>/<your-repo-name>.git
   git add .
   git commit -m "Initial personal website"
   git push -u origin main
   ```

5. In GitHub, open `Settings -> Pages`.
6. Set `Source` to `GitHub Actions`.
7. After the workflow finishes, your site will be available from the Pages URL.

## Optional next steps

- Add a `CNAME` file if you want to use a custom domain.
- Add a resume PDF and link it from the hero section.
- Replace the project cards with real work samples.
