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
      .headAppend(script(src := assetPath("nosweat/nostr.js?lightning=1"), defer)):
        main(cls := "box box-pad form3", id := "nostr-patron", attr("data-pubkey") := pubkey.getOrElse(""))(
          h1("Support Mute Chess"),
          p("Keep free, open-source chess running. Donate with Bitcoin over Lightning."),
          ctx.me
            .exists(_.isPatron)
            .option(p(iconTag(patronIconChar), " Your patron wings are active. Thank you!")),
          p(
            "You can also zap ",
            a(href := "https://primal.net/p/npub1w6l8e4mqa4ruqs2vdvwhdxhp9ke9ax8kpncy2wy26tja3d7rzpgq06c9jl")(
              "Mute Chess on Nostr"
            ),
            "."
          ),
          pubkey.fold[Frag](
            frag(
              p(
                a(href := "/login?referrer=/patron")("Sign in with Nostr"),
                " to donate here and get patron wings for 30 days."
              ),
              p("Or send a direct Lightning donation:"),
              code("eerieatlas700@walletofsatoshi.com")
            )
          )(_ =>
            frag(
              p(
                "Choose any amount. A confirmed payment through this page grants patron wings for 30 days. No subscription."
              ),
              label(`for` := "patron-amount")("Amount"),
              input(
                id := "patron-amount",
                tpe := "number",
                min := "1",
                step := "1",
                value := "1000",
                required
              ),
              label(`for` := "patron-currency")("Denomination"),
              select(id := "patron-currency")(
                option(value := "sats")("Satoshis"),
                option(value := "USD")("USD")
              ),
              p(id := "patron-quote"),
              button(id := "patron-create", tpe := "button", cls := "button")("Create Lightning invoice"),
              button(id := "patron-saved", tpe := "button", cls := "button button-metal", hidden)(
                "Use saved browser key"
              ),
              p(
                "A NIP-07 browser signer is recommended. Signing requests an invoice; pay it with your Lightning wallet."
              )
            )
          ),
          div(id := "patron-payment", pubkey.isDefined.option(hidden))(
            canvas(id := "patron-qr", cls := "qrcode", aria.label := "Lightning payment QR code"),
            p(a(id := "patron-open", cls := "button button-green")("Open Lightning wallet")),
            pubkey.isDefined.option(
              frag(
                p(id := "patron-invoice-amount"),
                button(id := "patron-copy", tpe := "button", cls := "button button-empty")("Copy invoice"),
                button(id := "patron-check", tpe := "button", cls := "button button-empty")("Check payment")
              )
            )
          ),
          p(id := "patron-status", role := "status", aria.live := "polite"),
          p(
            "Direct address: ",
            a(href := "lightning:eerieatlas700@walletofsatoshi.com")("eerieatlas700@walletofsatoshi.com")
          ),
          p(cls := "weak")(
            "For automatic wings, use an invoice created here while signed in. Direct wallet donations and zaps also support the project."
          )
        )
