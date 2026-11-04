package views

import lila.app.UiEnv.{ *, given }

object noSweatInfo:
  private val npub = "npub1w6l8e4mqa4ruqs2vdvwhdxhp9ke9ax8kpncy2wy26tja3d7rzpgq06c9jl"
  private val nostrUrl = s"https://primal.net/p/$npub"
  private val pages = List(
    "about" -> "About Mute Chess",
    "faq" -> "FAQ",
    "contact" -> "Contact",
    "terms-of-service" -> "Terms of Service",
    "privacy" -> "Privacy"
  )

  def apply(key: String)(using Context) =
    val title = pages.find(_._1 == key).map(_._2).getOrElse("Mute Chess")
    Page(title).css("bits.page"):
      main(cls := "box box-pad page mutechess-info")(
        st.nav(aria.label := "Information")(pages.map((path, name) => a(href := s"/$path")(name))),
        h1(title),
        content(key)
      )

  private def contactLink = a(href := nostrUrl)("Mute Chess on Nostr")
  private def forumLink = a(href := "/forum")("Mute Chess forum")

  private def content(key: String): Frag = key match
    case "about" =>
      frag(
        p(
          "Mute Chess is free, open-source chess against human-like Maia opponents. Choose a time control, play, then review the game with Stockfish and Maia."
        ),
        p(
          "Nostr is your login. Your profile holds your public name and game history. Anonymous games are casual; signed-in accounts can play rated games."
        ),
        h2(id := "credits")("Credits"),
        p("Mute Chess exists because of these open-source projects and their communities:"),
        ul(
          li(
            p(
              strong(a(href := "https://lichess.org")("Lichess")),
              " and ",
              a(href := "https://github.com/lichess-org/lila")("Lila"),
              " provide the foundation: the chess interface, games, clocks, profiles, puzzles and native analysis experience."
            )
          ),
          li(
            p(
              strong(a(href := "https://github.com/CSSLab/maia3")("Maia3 by CSSLab")),
              " powers our human-like opponents, move probabilities and expected-score predictions. The ",
              a(href := "https://github.com/CSSLab/maia-platform-frontend")("Maia platform"),
              " also informs our analysis features and move-quality colors."
            )
          ),
          li(
            p(
              strong(a(href := "https://github.com/franciscoBSalgueiro/en-croissant")("En Croissant")),
              " supplies the move-classification and material/sacrifice rules we adapt through Mobile Maia."
            )
          ),
          li(
            p(
              strong(a(href := "https://github.com/Dash1971/maia-chess-android-preview")("Mobile Maia")),
              " contributes stacked-premove behavior, analysis design and the En Croissant classification adaptations."
            )
          ),
          li(
            p(
              strong(a(href := "https://stockfishchess.org")("Stockfish")),
              " supplies the chess engine used for position evaluations, best moves and full-game searches."
            )
          )
        ),
        p(
          "Mute Chess is an independent project. Each upstream project retains its own licenses and credits. See our ",
          a(href := "https://github.com/Dash1971/mute-chess/blob/main/THIRD_PARTY.md")("third-party notices"),
          " for licenses, exact source revisions and further component and asset attributions."
        ),
        p(
          a(href := "/source")("Download the corresponding source"),
          " or ",
          a(href := "https://github.com/Dash1971/mute-chess")("browse GitHub"),
          "."
        ),
        p(forumLink)
      )
    case "faq" =>
      frag(
        h2("How do I start a game?"),
        p(
          "Click a time control on the home page. Custom opens the time-control dialog. We match you automatically with an available Maia opponent; there is no human lobby or bot picker."
        ),
        h2("Can I play a friend?"),
        p(
          "Yes. Sign in, open their profile and choose Challenge to play. Use Friends to follow players and see who is online. Invitations are separate from the Maia-only quick-pair grid. Challenge preferences and blocks apply."
        ),
        h2("How do ratings work?"),
        p(
          "Anonymous games are casual. Rated Nostr accounts start at provisional 1500 and use native Glicko ratings. Pairing looks for an available bot within 200 rating points. If the pool is busy, try again shortly."
        ),
        h2("Can I change the name shown on my account?"),
        p(
          "Yes. Click your account name, open your profile and choose Edit profile. Set a public name there; your Nostr identity and game history stay the same."
        ),
        h2("Where are my old games?"),
        p(
          "Open your profile to browse your games. Open a finished game and choose Analysis board. Tools also includes the analysis board, board editor and PGN import."
        ),
        h2("What do the analysis numbers mean?"),
        p(
          "Stockfish evaluates searched moves. Maia probabilities show how likely a human-like model is to play each move at the selected rating inputs. Maia score is win probability plus half the draw probability for the side to move. Rating inputs are model settings, not calibrated bot strength."
        ),
        h2("How do I turn analysis off?"),
        p(
          "Use the analysis toggle. It controls Stockfish and Maia together. Engine options are in analysis settings."
        ),
        h2("How do stacked premoves work?"),
        p(
          "Enable multiple premoves in the game board menu, then queue moves during the opponent’s turn. Escape or right-click cancels them. An illegal move, reconnect or finished game clears the queue."
        ),
        h2("How do I post in the forum?"),
        p(
          "Sign in, open a forum category and choose New Topic. You can post immediately, without playing a game or waiting. Replies are at the bottom of a topic. Forum rules, moderation and posting limits still apply."
        ),
        h2("How do patron wings work?"),
        p(
          "Sign in and create a Lightning invoice on ",
          a(href := "/patron")("the donation page"),
          ". A verified payment grants wings for 30 days. Direct Lightning donations and Nostr zaps support the project too, but do not automatically link wings to your account. USD amounts are approximate conversions; your invoice fixes the amount in sats."
        ),
        h2("Which Nostr login should I use?"),
        p(
          "A NIP-07 browser signer is recommended. You can also generate a key or import an nsec and save it in this browser. Back up your key: we cannot recover it for you. Two-factor authentication and session controls are available in account settings."
        ),
        h2("Does Mute Chess support variants or a mobile app?"),
        p(
          "Standard chess in desktop browsers is the focus. Other variants and a dedicated mobile app are not offered."
        ),
        h2("Need help?"),
        p(forumLink)
      )
    case "contact" =>
      frag(
        p("For questions, feedback or bug reports, post in the ", forumLink, "."),
        p("Include the page URL and what happened. Keep personal information out of public posts."),
        p(
          "For private account, privacy, payment or security matters, message ",
          contactLink,
          ". Never send your nsec, authenticator secret, recovery codes or wallet seed."
        ),
        p(
          "For a bug report, include the page URL and what happened. Share account or payment details only in private."
        )
      )
    case "terms-of-service" =>
      frag(
        p(cls := "weak")("Updated October 29, 2026"),
        h2("Using Mute Chess"),
        p(
          "These terms cover mutechess.org, an independent open-source chess service operated as the Mute Chess project. Contact the project through ",
          contactLink,
          ". By using the service, you agree to these terms and to use it lawfully. If you cannot legally agree on your own, involve a parent or guardian."
        ),
        h2("Your account and content"),
        p(
          "You control your Nostr keys. Keep them and your recovery information safe. We cannot replace a lost key or guarantee recovery of an account. Use only identities you control."
        ),
        p(
          "Your profile, games and forum posts may be public. You keep your rights in what you submit and permit us to store, process and display it to run the service. Do not submit content you lack the right to share."
        ),
        h2("Fair use"),
        p(
          "Do not harass others, expose private information, post unlawful content or spam, manipulate ratings, impersonate people, attack the service or abuse the bot pool. We may moderate content and restrict accounts to protect the service and its users."
        ),
        h2("Donations"),
        p(
          "Donations are voluntary support, not a subscription or a purchase of guaranteed service. Check the amount and recipient before paying. Supported payments can grant a temporary patron mark as described on the donation page. If a payment or mark is wrong, contact us privately on Nostr. Your wallet and payment provider have their own terms and fees."
        ),
        h2("Availability and changes"),
        p(
          "We may change, pause or discontinue features. Engine output, move labels and ratings can be wrong. Keep your own copies of games and keys. The service is provided as available, without a guarantee of uninterrupted operation or error-free analysis, to the extent permitted by applicable law."
        ),
        p(
          "Nothing here removes rights or liabilities that applicable law does not allow us to exclude. Material changes will be reflected in these terms and their update date."
        ),
        p("See ", a(href := "/privacy")("Privacy"), " for how the service handles data.")
      )
    case "privacy" =>
      frag(
        p(cls := "weak")("Updated October 29, 2026"),
        h2("What we store"),
        p(
          "Mute Chess stores your Nostr public key and account identifier, optional public profile information, games, ratings, puzzle and lesson progress, preferences, forum content and login sessions. If you enable two-factor authentication, we store the information needed to validate it and manage recovery codes."
        ),
        p(
          "We process IP addresses, session/device information, timestamps and security logs to operate the site, rate-limit requests and investigate abuse. Payment records can include your public key, signed donation request, invoice, payment hash and receipt so we can verify payments and assign patron wings."
        ),
        h2("Keys and browser storage"),
        p(
          "With a browser signer, the signer holds your private key. If you choose generated or imported browser keys, the browser stores an encrypted key and the wrapping key in IndexedDB. Site scripts can use that store to sign, so a separate signer is recommended. Your nsec is not sent to the Mute Chess server."
        ),
        p(
          "A session cookie keeps you signed in. Browser storage also keeps preferences, cached engines/models and local analysis. Clear site data to remove browser-held data, but back up any browser key first. Removing browser data does not delete server records or public Nostr events."
        ),
        h2("Public information"),
        p(
          "Profiles, rated identities, game history, spectator games and forum content can be publicly visible. Nostr zap requests and receipts may be published to public relays. Copies on other services are outside our control."
        ),
        h2("Other services"),
        p(
          "Cloudflare handles public web traffic and security filtering and can process network/request information. Lightning invoices use Wallet of Satoshi’s payment infrastructure. The donation page can contact Nostr relays to find receipts and mempool.space for approximate USD conversion. These services receive the requests and network information needed for their role."
        ),
        p(
          a(href := "https://www.cloudflare.com/privacypolicy/")("Cloudflare privacy"),
          " · ",
          a(href := "https://www.walletofsatoshi.com/privacy")("Wallet of Satoshi privacy")
        ),
        p(
          "Stockfish and board analysis with Maia run locally in your browser after their assets download. Maia opponents run on our server and receive the position and move history needed to play. Links to Nostr clients and GitHub open independent services with their own policies."
        ),
        h2("Retention and requests"),
        p(
          "Account and game data remain available for service operation and game history. Security records and encrypted backups are retained for operations and investigations; we do not currently promise a fixed automatic deletion period. We do not sell personal data or use advertising trackers."
        ),
        p(
          "To request access, correction or deletion, contact ",
          contactLink,
          " privately and identify your account without sending private keys. We may ask you to prove control of your public key. Legal obligations, abuse prevention, other players’ game history, backups and public relay copies can limit what can be removed or how quickly it disappears."
        )
      )
    case _ => emptyFrag
