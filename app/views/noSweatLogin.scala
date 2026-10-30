package views

import lila.app.UiEnv.{ *, given }

object noSweatLogin:
  def apply()(using Context) =
    Page("Sign in")
      .css("bits.auth")
      .headAppend(link(rel := "stylesheet", href := s"${assetPath("nosweat/nostr.css")}?v=key-backup2"))
      .headAppend(script(src := s"${assetPath("nosweat/nostr.js")}?v=key-backup2", defer)):
        main(cls := "auth auth-login box box-pad")(
          div(cls := "auth__brand")(
            img(
              cls := "nosweat-login-wordmark nosweat-dark",
              src := assetPath("nosweat/wordmark.svg"),
              alt := "Mute Chess"
            ),
            img(
              cls := "nosweat-login-wordmark nosweat-light",
              src := assetPath("nosweat/wordmark-light.svg"),
              alt := "Mute Chess"
            )
          ),
          h1("Sign in or join"),
          p(cls := "nostr-intro")(
            "Your Nostr identity connects you to your profile and games. No email needed."
          ),
          details(cls := "nostr-guide")(
            summary("New to Nostr?"),
            p(
              "Nostr is an open identity you can use across compatible apps. Your npub is public; your nsec is the private key you use to sign in."
            ),
            p(
              "A signer keeps your key and approves sign-in for you. You can also create or import a key in this browser. Signing in here does not post to Nostr."
            ),
            p(
              "To return on another device, use the same key or signer. Creating a new key creates a different identity."
            )
          ),
          div(id := "nostr-methods", cls := "form3")(
            button(id := "nostr-generate", cls := "button button-green")("Create a key and play"),
            div(id := "nostr-created", hidden)(
              p(
                "Save a copy of this key so you can return on another device. A password manager is a good place for it; anyone with the key can use this identity."
              ),
              input(
                id := "nostr-backup",
                cls := "form-control",
                tpe := "password",
                readonly,
                autocomplete := "off",
                aria.label := "Your new Nostr secret key"
              ),
              div(cls := "nostr-key-actions")(
                button(id := "nostr-copy", cls := "button button-metal")("Copy key"),
                button(id := "nostr-download", cls := "button button-metal")("Download .txt"),
                button(id := "nostr-reveal", cls := "button button-empty")("Show key")
              ),
              label(cls := "form-label", `for` := "nostr-username")("Username (optional)"),
              input(
                id := "nostr-username",
                cls := "form-control",
                maxlength := 20,
                autocomplete := "username"
              ),
              button(id := "nostr-create-login", cls := "button button-green")("Save key and play")
            ),
            p(cls := "nostr-help")(
              "This browser remembers your key between visits, as long as its site data is kept. Keep a separate backup."
            ),
            div(id := "nostr-saved", hidden)(
              button(id := "nostr-use-saved", cls := "button")("Continue with saved key"),
              details(cls := "nostr-guide")(
                summary("Back up your saved key"),
                p("Copy it to your password manager or download a private .txt copy."),
                div(cls := "nostr-key-actions")(
                  button(id := "nostr-copy-saved", cls := "button button-metal")("Copy key"),
                  button(id := "nostr-download-saved", cls := "button button-metal")("Download .txt")
                )
              ),
              button(id := "nostr-forget", cls := "button button-empty")("Forget saved key")
            ),
            div(cls := "or-separator")(span("Already use Nostr?")),
            button(id := "nostr-extension", cls := "button button-metal")(
              "Log in with signer"
            ),
            p(cls := "nostr-help")(
              "Already have a signer? Continue directly. Or install ",
              a(
                href := "https://chromewebstore.google.com/detail/nos2x/kpgefcfmnafjgpblomihpgmejjdanjjp",
                targetBlank,
                rel := "noopener noreferrer"
              )("nos2x for Chrome / Chromium"),
              ". Other compatible Nostr signers work too."
            ),
            label(cls := "form-label", `for` := "nostr-nsec")("Or paste your existing secret key"),
            input(
              id := "nostr-nsec",
              cls := "form-control",
              tpe := "password",
              autocomplete := "off",
              spellcheck := "false",
              placeholder := "nsec1…"
            ),
            button(id := "nostr-import", cls := "button button-metal")("Save key and sign in"),
            details(cls := "nostr-guide")(
              summary("Keeping access to your key"),
              p(
                "Clearing site data, a new browser or profile, or another device needs your original key or signer. Private browsing may remove the key when you close it. Browser storage is not a backup."
              ),
              p(
                "You can ask this browser to keep site data for longer. It decides whether to allow this, and you can still clear it yourself."
              ),
              button(id := "nostr-persist", cls := "button button-empty")("Ask browser to keep site data"),
              p(
                "For a password manager, add an entry for mutechess.org and paste the copied nsec into its password field or secure note. In Apple Passwords, save it as the password; iCloud Keychain can sync the entry when enabled. Copy that same key back here to restore access."
              ),
              p("The .txt download contains your key as plain text. Keep it somewhere private.")
            )
          ),
          div(id := "nostr-second-factor", cls := "form3", hidden)(
            h2("One more step"),
            p("Two-factor authentication is enabled for this account."),
            label(cls := "form-label", `for` := "nostr-token")("Authenticator or recovery code"),
            input(
              id := "nostr-token",
              cls := "form-control",
              autocomplete := "one-time-code",
              maxlength := 64
            ),
            button(id := "nostr-verify", cls := "button button-green")("Sign in"),
            button(id := "nostr-back", cls := "button button-empty")("Use a different key")
          ),
          p(id := "nostr-status", role := "status", aria.live := "polite"),
          p(cls := "nostr-help")(
            "Your secret key stays in your browser. Signing in does not post anything to Nostr."
          ),
          a(href := "/")("Play without signing in")
        )
