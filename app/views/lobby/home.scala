package views.lobby

import play.api.libs.json.Json

import lila.app.UiEnv.{ *, given }
import lila.app.mashup.Preload.Homepage
import lila.core.perf.UserWithPerfs

object home:

  def apply(homepage: Homepage)(using ctx: Context) =
    import homepage.*
    Page("")
      .copy(fullTitle = s"$siteName • ${trans.site.freeOnlineChess.txt()}".some)
      .i18n(_.variant)
      .js(
        PageModule(
          "lobby",
          Json
            .obj(
              "data" -> data,
              "noSweat" -> env.noSweat.enabled,
              "showRatings" -> ctx.pref.showRatings
            )
            .add("hasUnreadLichessMessage", hasUnreadLichessMessage)
            .add("bots", Granter.opt(_.Beta))
            .add("playban", playban.map(lila.playban.TempBan.lobbyJson))
        )
      )
      .css("lobby")
      .graph(
        OpenGraph(
          image = assetFullUrl(if env.noSweat.enabled then "nosweat/social.png"
          else "logo/lichess-tile-wide.png").some,
          title = if env.noSweat.enabled then "Mute Chess — Stay human. Play bots."
          else "The best free, adless Chess server",
          url = netBaseUrl.into(Url),
          description =
            if env.noSweat.enabled then "Free, open-source chess with human-like Maia opponents."
            else trans.site.siteDescription.txt()
        )
      )
      .hrefLangs(lila.ui.LangPath("/")):
        given Option[UserWithPerfs] = homepage.me
        main(
          cls := List(
            "lobby" -> true,
            "lobby-nope" -> (playban.isDefined || currentGame.isDefined || homepage.hasUnreadLichessMessage)
          )
        )(
          div(cls := "lobby__side")(
            ctx.blind.option(h2(trans.nvui.featuredEvents())),
            ctx.kid.no.option(views.streamer.bits.liveStreams(streams)),
            div(cls := "lobby__spotlights"):
              val eventTags = events.map(bits.spotlight)
              val relayTags = views.relay.ui.spotlight(relays)
              frag(
                eventTags,
                relayTags,
                ctx.noBot.option {
                  val nbManual = eventTags.size + relayTags.size
                  val simulBBB = simuls.find(isFeaturable(_) && nbManual < 4)
                  val nbForced = nbManual + simulBBB.size.toInt
                  val tourBBBs = if nbForced > 3 then 0 else if nbForced == 3 then 1 else 3 - nbForced
                  frag(
                    lila.tournament.Spotlight.select(tours, tourBBBs).map {
                      views.tournament.list.homepageSpotlight(_)
                    },
                    swiss.ifTrue(nbForced < 3).map(views.swiss.ui.homepageSpotlight),
                    simulBBB.map(views.simul.ui.homepageSpotlight)
                  )
                }
              )
            ,
            classes.nonEmpty.option:
              div(cls := "lobby__classes"):
                classes.map: clas =>
                  a(href := routes.Clas.show(clas.id), dataIcon := Icon.Group)(clas.name)
            ,
            if ctx.isAuth then
              div(cls := "lobby__timeline")(
                ctx.blind.option(h2(trans.site.timeline())),
                views.timeline.entries(userTimeline)
              )
            else if env.noSweat.enabled then
              div(cls := "about-side mutechess-intro")(
                ctx.blind.option(h2(trans.site.about())),
                strong("Stay human. Play bots."),
                p("Free, open-source chess against human-like Maia opponents."),
                a(href := "/source")(trans.site.sourceCode())
              )
            else
              div(cls := "about-side")(
                ctx.blind.option(h2(trans.site.about())),
                trans.site.xIsAFreeYLibreOpenSourceChessServer(
                  "Lichess",
                  a(cls := "blue", href := routes.Plan.features)(trans.site.really.txt())
                ),
                " ",
                a(href := "/about")(trans.site.aboutX("Lichess"), "...")
              )
          ),
          currentGame
            .map(bits.currentGameInfo)
            .orElse:
              hasUnreadLichessMessage.option(bits.showUnreadLichessMessage)
            .orElse:
              playban.map(bits.playbanInfo)
            .getOrElse:
              if ctx.blind then blindLobby(blindGames) else bits.lobbyApp
          ,
          div(cls := "lobby__table")(
            div(cls := "lobby__start")(
              button(cls := "button button-metal lobby__start__button lobby__start__button--hook")(
                trans.site.createLobbyGame()
              ),
              Option.unless(env.noSweat.enabled)(
                button(cls := "button button-metal lobby__start__button lobby__start__button--friend")(
                  trans.site.challengeAFriend()
                )
              ),
              Option.unless(env.noSweat.enabled)(
                button(cls := "button button-metal lobby__start__button lobby__start__button--ai")(
                  trans.site.playAgainstComputer()
                )
              )
            )
          ),
          div(cls := "lobby__tv")(
            featured.map(g => views.game.mini(Pov.naturalOrientation(g), tv = true))
          ),
          div(cls := "lobby__puzzle")(
            puzzle.map(p => views.puzzle.bits.dailyLink(p)())
          ),
          views.ublog.ui.homeCarousel(ublogPosts),
          div(cls := "lobby__feed"):
            views.feed.lobbyUpdates(lastUpdates)
          ,
          ctx.noBot.option(bits.underboards(tours, simuls)),
          div(cls := "lobby__about")(
            ctx.blind.option(h2(trans.site.about())),
            a(href := "/about")(trans.site.aboutX(if env.noSweat.enabled then "Mute Chess" else "Lichess")),
            a(href := "/faq")(trans.faq.faqAbbreviation()),
            a(href := "/contact")(trans.contact.contact()),
            a(href := "/app")(trans.site.mobileApp()),
            a(href := routes.Cms.tos)(trans.site.termsOfService()),
            a(href := "/privacy")(trans.site.privacy()),
            a(href := "/source")(trans.site.sourceCode()),
            a(href := "/ads")(trans.site.blockAds()),
            views.bits.connectLinks
          )
        )
