package views

import lila.app.UiEnv.{ *, given }

object noSweatLogin:
  def apply()(using Context) =
    Page("Sign in")
      .css("bits.auth")
      .headAppend(link(rel := "stylesheet", href := s"${assetPath("nosweat/nostr.css")}?v=key-first1"))
      .headAppend(script(src := s"${assetPath("nosweat/nostr.js")}?v=key-first1", defer)):
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
            "No email needed. A Nostr secret key, called an nsec, is your login. Keep it to return to your profile and games."
          ),
          div(id := "nostr-methods", cls := "form3")(
            button(id := "nostr-generate", cls := "button button-green")("Create a key and play"),
            div(id := "nostr-created", hidden)(
              p(
                "Save this secret key in your password manager. Anyone with it can access your account. We cannot recover it for you."
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
              "We save the key in this browser. Keep your own backup before clearing browser data or switching devices."
            ),
            div(id := "nostr-saved", hidden)(
              button(id := "nostr-use-saved", cls := "button")("Continue with saved key"),
              button(id := "nostr-forget", cls := "button button-empty")("Forget saved key")
            ),
            div(cls := "or-separator")(span("Already use Nostr?")),
            button(id := "nostr-extension", cls := "button button-metal")(
              "Join or sign in with browser signer"
            ),
            p(cls := "nostr-help")(
              "A NIP-07 browser signer is recommended if you have one. It keeps your secret key outside this site."
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
            button(id := "nostr-import", cls := "button button-metal")("Save key and sign in")
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
