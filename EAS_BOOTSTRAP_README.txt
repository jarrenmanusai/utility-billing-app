EAS BOOTSTRAP — ONE-TIME-ONLY, RUN ON YOUR LAPTOP
====================================================

This is the only step in the entire deploy flow that **cannot** be
done from a Manus sandbox agent. It takes ~5 minutes, you do it ONCE
per project, and after that every future agent run is fully hands-off.

WHY:
  `eas init` requires an interactive terminal to ask for the project
  name on expo.dev. Manus sandbox terminals are stream-wrapped and
  cannot answer interactive prompts. So this step lives on your laptop.

WHAT TO DO:
-----------

1. Open a terminal on your local machine (Mac/Linux/WSL).

2. Get an Expo personal access token:
     a. Visit https://expo.dev/settings/access-tokens
     b. Click "Create token", give it a name like "utilitybill-eas".
     c. Copy the token (it shows once — store it in your password manager).

3. Clone the repo if you don't already have it:
     git clone https://github.com/jarrenmanusai/utility-billing-app.git
     cd utility-billing-app
     pnpm install --frozen-lockfile        # or `npm install` if you don't use pnpm

4. Run the bootstrap script:
     export EXPO_TOKEN=<paste-the-token>
     bash scripts/bootstrap-eas-projectid.sh

5. Answer the eas-cli prompts:
     - Owner       → your Expo username (e.g. "jarrenmanusai")
     - Slug        → press Enter to accept the default "utility-billing-app"
     - Confirm     → "y"

6. The script will:
     - Create the project on expo.dev
     - Inject extra.eas.projectId into app.config.ts
     - git add + commit + push automatically

7. Verify:
     grep projectId app.config.ts
     # should print: projectId: "<some-uuid>"

8. Done. You can now hand off to a new Manus agent — `pnpm verify:deploy`
   will see the projectId and pass that check, and the agent will run
   the deploy end-to-end without asking about anything except the two
   irreducible inputs (EXPO_TOKEN + keystore choice).

WHAT IF I CAN'T RUN BASH ON MY LAPTOP:
--------------------------------------

You can do the same thing by hand in 4 commands:

  cd /path/to/utility-billing-app
  export EXPO_TOKEN=<your-token>
  npx eas-cli@latest init
  git add app.config.ts && git commit -m "chore(eas): projectId" && git push

The script in step 4 just adds safety checks around those 4 commands.

TROUBLESHOOTING:
----------------

- "Authentication required" → your EXPO_TOKEN is missing/wrong.
- "Project already exists with this slug" → someone in your Expo org
   already created it. Run `npx eas-cli init --force` to link to it.
- "Owner mismatch" → in eas-cli's prompt pick the owner that matches
   your Expo team (personal vs org).
- App.config.ts diff looks weird → that's fine, eas-cli adds:
     extra: { eas: { projectId: "..." } }
   to the config object. Commit it as-is.
