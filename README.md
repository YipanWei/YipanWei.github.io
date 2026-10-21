# Personal Website

This repository contains a static personal website that can be deployed with
GitHub Pages.

## Files

- `index.html`: page structure and text content
- `research.html`: research notes and paper reading page
- `failures.html`: unsuccessful submissions, ordered by the relevant official notification date
- `summary.pdf`: paper reading notes linked from the research notes page
- `styles.css`: visual design and responsive layout
- `script.js`: small interactions and footer year
- `.github/workflows/deploy.yml`: GitHub Pages deployment workflow

## How to customize

`failures.html` uses one sentence per submission, without review-stage labels.
Each conference links to its official schedule (checked 2026-10-21).
The ordering references are ICCV 2025 (2025-06-26), AAAI 2026 (2025-09-15),
NeurIPS 2025 (2025-09-18), CVPR 2026 (2026-02-20), and AAAI 2027 (2026-09-24).
Dates are not displayed on the page. Outcomes come from the owner, not from
public schedules; add personal dates or reflections only when supplied.

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
