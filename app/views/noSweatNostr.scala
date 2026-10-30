package views

import lila.app.UiEnv.{ *, given }

object noSweatNostr:
  private val communityNpub = "npub1w6l8e4mqa4ruqs2vdvwhdxhp9ke9ax8kpncy2wy26tja3d7rzpgq06c9jl"

  def apply(user: User)(using Context) =
    account.ui
      .AccountPage("Nostr", "nostr")
      .headAppend(script(src := s"${assetPath("nosweat/nostr.js")}?v=account-keys1", defer)):
        div(
          id := "nostr-keys",
          cls := "box box-pad form3",
          attr("data-public-key") := user.nostrKey.getOrElse("")
        )(
          h1("Nostr"),
          h2("Chess on Nostr"),
          p(
            "Your Mute Chess identity also works in Nostr social apps. Primal is one way to get started in your browser."
          ),
          p(
            a(
              href := s"https://primal.net/p/$communityNpub",
              target := "_blank",
              rel := "noopener noreferrer",
              cls := "button"
            )(
              "Follow Mute Chess on Primal"
            ),
            " ",
            a(href := "https://primal.net/", target := "_blank", rel := "noopener noreferrer")("Open Primal")
          ),
          ol(
            li("Sign in to Primal with your existing Nostr signer to use the same identity."),
            li("Open Mute Chess’s profile and choose Follow."),
            li(
              "Search for #chess to discover posts and people. You can also explore the people Mute Chess follows."
            )
          ),
          p(
            "If your key is saved only in this browser, back it up below and import it into a signer you trust. Keep your nsec private; following someone only needs their public profile."
          ),
          user.nostrKey
            .flatMap(lila.core.NostrName.npub)
            .map: npub =>
              frag(
                h2("Public key · npub"),
                p("Your public identity. You can share this with other people."),
                div(cls := "nosweat-key-field")(
                  input(id := "nostr-keys-npub", aria.label := "Nostr public key", readonly, value := npub),
                  button(id := "nostr-keys-copy-npub", tpe := "button", cls := "button")("Copy npub")
                ),
                h2("Private key · nsec"),
                p(
                  strong("Anyone with your nsec can sign in as you and use your Nostr identity."),
                  " Never share it or send it to support. Store a backup in your password manager. Copying it also places it on your device’s clipboard."
                ),
                p(
                  "Only a matching key saved in this browser can be shown here. If you use an external signer, manage your private key in that signer. Your nsec is never sent to this server."
                ),
                label(
                  input(id := "nostr-keys-ack", tpe := "checkbox"),
                  " I understand that my private key gives full access to my Nostr identity."
                ),
                p(
                  button(id := "nostr-keys-reveal", tpe := "button", cls := "button", disabled)(
                    "Show private key"
                  )
                ),
                div(id := "nostr-keys-private", hidden)(
                  div(cls := "nosweat-key-field")(
                    input(
                      id := "nostr-keys-nsec",
                      aria.label := "Nostr private key",
                      readonly,
                      autocomplete := "off",
                      spellcheck := false
                    ),
                    button(id := "nostr-keys-copy-nsec", tpe := "button", cls := "button", disabled)(
                      "Copy nsec"
                    )
                  ),
                  p("The key hides automatically after one minute or when you leave this tab.")
                ),
                p(id := "nostr-keys-status", role := "status", aria.live := "polite")
              )
        )
