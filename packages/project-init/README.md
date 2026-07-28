# HEAD host installer and file-only project initializer

From an extracted generated release, run `./head init <target>`. It ensures the user-scoped host, initializes and registers the project through the installed stable command, then starts protected onboarding. It discovers capability-compatible OpenCode and Herdr executables, or accepts `--opencode`, `--herdr`, and `--socket` overrides; it does not configure model, provider, or credentials.

`head install`, `head project init <target> [--project-id <id>]`, and `head onboarding start <target>` remain the installed phase commands.

With a healthy installed host, `head project init <target> [--project-id <id>]` creates and registers a generic, launch-ready project. It writes only generated manifests/configuration and absent project-owned seeds; it does not create a Session, start OpenCode, or alter Herdr.

For an already launch-ready project, `head onboarding start <target>` creates (or safely resumes) its exact `onboarding` Session and one labeled Herdr HEAD tab, starts OpenCode with the user's existing model/auth authority, sends the fixed protected onboarding prompt, focuses the tab, and prints its machine-readable identity.
