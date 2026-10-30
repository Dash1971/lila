package views

import lila.app.UiEnv.{ *, given }

object noSweatPatron:
  def apply(pubkey: Option[String])(using ctx: Context) =
    Page("Support Mute Chess")
      .css("bits.patron")
      .csp(csp =>
        csp.copy(connectSrc =
          csp.connectSrc ::: List(
            "https://mempool.space",
            "wss://relay.damus.io",
            "wss://nos.lol",
            "wss://relay.primal.net"
          )
        )
      )
      .headAppend(script(src := assetPath("nosweat/nostr.js?lightning=3"), defer)):
        main(cls := "box box-pad", id := "nostr-patron", attr("data-pubkey") := pubkey.getOrElse(""))(
          div(cls := "patron-heading")(
            h1("Support Mute Chess"),
            a(
              href := "/",
              cls := "fbt patron-close",
              aria.label := "Close donation",
              title := "Close",
              dataIcon := Icon.X
            )
          ),
          p(cls := "patron-upstream")(
            strong("Lichess first. "),
            "Mute Chess exists largely thanks to Lichess. If you haven't donated to them yet, or can only afford to support one project, please ",
            a(href := "https://lichess.org/patron")("donate to Lichess"),
            ". Donate to Mute Chess only if you really love our work integrating Maia with the Lichess experience."
          ),
          p(cls := "patron-intro")("Bitcoin over Lightning. Any amount helps."),
          ctx.me
            .exists(_.isPatron)
            .option(p(cls := "patron-thanks")(iconTag(patronIconChar), " Your wings are active. Thank you!")),
          pubkey.fold[Frag](
            p(
              a(href := "/login?referrer=/patron")("Sign in with Nostr"),
              " for 30-day patron wings, or donate directly below."
            )
          )(_ =>
            frag(
              p("A confirmed donation gives you patron wings for 30 days."),
              div(cls := "patron-fields")(
                div(cls := "patron-field")(
                  label(`for` := "patron-amount")("Amount"),
                  input(
                    id := "patron-amount",
                    tpe := "number",
                    min := "1",
                    step := "1",
                    value := "1000",
                    required
                  )
                ),
                div(cls := "patron-field")(
                  label(`for` := "patron-currency")("Currency"),
                  select(id := "patron-currency")(
                    option(value := "sats")("Sats"),
                    option(value := "USD")("USD")
                  )
                )
              ),
              p(id := "patron-quote", cls := "patron-note"),
              div(cls := "patron-actions")(
                button(id := "patron-create", tpe := "button", cls := "button")("Create invoice"),
                button(id := "patron-saved", tpe := "button", cls := "button button-metal", hidden)(
                  "Use saved key"
                )
              ),
              p(cls := "patron-note")(
                "A browser signer is recommended. Pay the invoice with your Lightning wallet."
              )
            )
          ),
          div(id := "patron-payment", pubkey.isDefined.option(hidden))(
            canvas(id := "patron-qr", cls := "qrcode", aria.label := "Lightning payment QR code"),
            p(a(id := "patron-open", cls := "button")("Open wallet")),
            pubkey.isDefined.option(
              frag(
                p(id := "patron-invoice-amount"),
                div(cls := "patron-actions")(
                  button(id := "patron-copy", tpe := "button", cls := "button button-empty")("Copy invoice"),
                  button(id := "patron-check", tpe := "button", cls := "button button-empty")("Check payment")
                )
              )
            )
          ),
          p(id := "patron-status", role := "status", aria.live := "polite"),
          div(cls := "patron-direct")(
            a(href := "lightning:dash@walletofsatoshi.com")("dash@walletofsatoshi.com"),
            a(href := "https://primal.net/p/npub1w6l8e4mqa4ruqs2vdvwhdxhp9ke9ax8kpncy2wy26tja3d7rzpgq06c9jl")(
              "Zap Mute Chess on Nostr"
            )
          ),
          p(cls := "patron-note")(
            "For automatic wings, create your invoice here while signed in. ",
            a(href := "/about#credits")("Credits and source")
          )
        )
