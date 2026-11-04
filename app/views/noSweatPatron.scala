package views

import lila.app.UiEnv.{ *, given }
import lila.core.i18n.I18nKey

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
        main(
          cls := "box box-pad",
          id := "nostr-patron",
          attr("data-pubkey") := pubkey.getOrElse(""),
          attr("data-paid-status") := I18nKey("muteDonationPaid").txt(),
          attr("data-waiting") := I18nKey("muteDonationWaiting").txt(),
          attr("data-signer-needed") := I18nKey("muteDonationSignInAgain").txt()
        )(
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
          p(
            id := "patron-thanks",
            cls := "patron-thanks",
            (!ctx.me.exists(_.isPatron)).option(hidden)
          )(
            span(cls := "patron-paid-wing", attr("aria-hidden") := "true")(iconTag(patronIconChar)),
            span(cls := "patron-paid-check", attr("aria-hidden") := "true")(iconTag(Icon.Checkmark)),
            " ",
            I18nKey("mutePatronThanks")()
          ),
          pubkey.fold[Frag](
            p(
              a(href := "/login?referrer=/patron")("Sign in with Nostr"),
              " for 30-day patron wings, or donate directly below."
            )
          )(_ =>
            div(id := "patron-form")(
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
                button(id := "patron-create", tpe := "button", cls := "button")("Create invoice")
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
          p(cls := "patron-note")(
            "For automatic wings, create your invoice here while signed in. ",
            a(href := "/about#credits")("Credits and source")
          )
        )
