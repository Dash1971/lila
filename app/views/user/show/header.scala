package views.user
package show

import lila.app.UiEnv.{ *, given }
import lila.app.mashup.UserInfo
import lila.core.i18n.I18nKey
import lila.user.Plan.sinceDate
import lila.user.PlayTime.*
import lila.user.Profile.*
import lila.web.ui.bits.splitNumber

object header:

  private val actionMenu = lila.user.ui.UserActionMenu(helpers, env.noSweat.enabled)

  private val dataToints = attr("data-toints")
  private val dataTab = attr("data-tab")

  private def identityInfo(kind: String, label: String) =
    button(
      tpe := "button",
      cls := "button-empty user-show__identity-info",
      dataIcon := Icon.InfoCircle,
      attr("data-nostr-help") := s"nostr-help-$kind",
      attr("aria-haspopup") := "dialog",
      aria.label := label,
      title := label
    )

  private def identityHelp(u: User)(using Context) = frag(
    div(id := "nostr-help-npub", cls := "none")(
      h2(I18nKey("muteNpubHelpTitle")()),
      p(
        I18nKey("muteNpubHelpIdentity")(
          a(href := "https://nostr.org/", targetBlank, rel := "noopener noreferrer")("Nostr")
        )
      ),
      p(I18nKey("muteNpubHelpPair")()),
      p(strong(I18nKey("muteNpubHelpSecret")()), " ", I18nKey("muteNpubHelpWarning")()),
      p(
        I18nKey("muteNpubHelpApps")(
          a(href := "https://primal.net/", targetBlank, rel := "noopener noreferrer")("Primal")
        )
      ),
      p(I18nKey("muteNpubHelpPrivacy")())
    ),
    div(id := "nostr-help-handle", cls := "none")(
      h2(I18nKey("muteHandleHelpTitle")()),
      p(
        if u.nostrKey.exists(k => u.username.value.equalsIgnoreCase("n" + k.take(19))) then
          I18nKey("muteHandleHelpDerived")()
        else I18nKey("muteHandleHelpGeneric")()
      ),
      p(I18nKey("muteHandleHelpLink")())
    )
  )

  private def possibleSeoBot(u: User) =
    !u.isVerified && !u.hasTitle && u.count.game < 5 && u.profile.exists(_.hasLinks)

  private def userActionsMenu(u: User, social: UserInfo.Social)(using ctx: Context) =
    actionMenu(
      u,
      ctx
        .isnt(u)
        .so:
          views.relation.actions(
            u.light,
            relation = social.relation,
            followable = social.followable,
            blocked = social.blocked,
            messageable = social.messageable
          )
      ,
      ctx.useMe(lila.mod.canImpersonate(u.id))
    )

  private def userDom(u: User)(using ctx: Context) =
    span(
      cls := userClass(u.id, none, withOnline = !u.isPatron, withPowerTip = false),
      dataHref := userUrl(u.username)
    )(
      u.isPatron.not.so(lineIcon(u)),
      titleTag(u.title),
      u.publicName,
      if ctx.blind
      then s" : ${if isOnline.exec(u.id) then trans.site.online.txt() else trans.site.offline.txt()}"
      else
        userFlair(u).map: flair =>
          if ctx.isAuth then a(href := routes.Account.profile, title := trans.site.setFlair.txt())(flair)
          else flair
    )

  def apply(u: User, info: UserInfo, angle: UserInfo.Angle, social: UserInfo.Social)(using ctx: Context) =
    val showLinks = !possibleSeoBot(u) || isGranted(_.Shadowban)
    val publicNpub = u.nostrKey.filter(_ => u.noBot).flatMap(lila.core.NostrName.npub)
    frag(
      div(
        cls := s"box__top user-show__header${
            if publicNpub.isDefined then " user-show__header--nostr" else ""
          }"
      )(
        u.patronAndColor.match
          case Some(p) =>
            h1(cls := s"user-link ${if isOnline.exec(u.id) then "online" else "offline"}")(
              a(href := routes.Plan.index())(patronIcon(p)),
              userDom(u)
            )
          case None => h1(userDom(u)),
        if publicNpub.isDefined then
          span(cls := "user-show__handle")(
            s"@${u.username.value}",
            identityInfo("handle", I18nKey("muteAboutHandle").txt())
          )
        else
          u.profile
            .flatMap(_.displayName)
            .filter(_ != u.username.value)
            .map(_ => span(cls := "user-show__handle")(s"@${u.username.value}"))
        ,
        div(cls := "trophies")(
          views.user.bits.perfTrophies(u, info.ranks),
          otherTrophies(info),
          u.plan.active.option(
            a(
              href := routes.Plan.index(),
              cls := "trophy award patron icon3d",
              ariaTitle(trans.patron.patronSince.txt(showDate(u.plan.sinceDate)))
            )(patronIconChar)
          )
        ),
        u.enabled.no.option(span(cls := "closed")("CLOSED"))
      ),
      publicNpub.map: npub =>
        frag(
          div(cls := "user-show__nostr")(
            a(
              cls := "user-show__nostr-link",
              href := s"/@/$npub",
              ariaTitle(I18nKey("muteCopyNpub").txt())
            )(npub),
            identityInfo("npub", I18nKey("muteAboutNpub").txt()),
            span(cls := "user-show__nostr-feedback", attr("role") := "status", attr("aria-live") := "polite")
          ),
          identityHelp(u)
        ),
      div(cls := "user-show__social")(
        div(cls := "number-menu")(
          u.noBot.option(
            a(
              href := routes.UserTournament.path(u.username, "recent"),
              cls := "nm-item",
              dataToints := u.toints
            )(
              splitNumber(trans.site.nbTournamentPoints.pluralSame(u.toints))
            )
          ),
          (info.nbSimuls > 0).option(
            a(
              href := routes.Simul.byUser(u.username),
              cls := "nm-item"
            )(
              splitNumber(trans.site.nbSimuls.pluralSame(info.nbSimuls))
            )
          ),
          (info.nbRelays > 0).option(
            a(
              href := routes.RelayTour.by(u.username),
              cls := "nm-item"
            )(
              splitNumber(trans.broadcast.nbBroadcasts.pluralSame(info.nbRelays))
            )
          ),
          (info.nbStudies > 0).option(
            a(href := routes.Study.byOwnerDefault(u.username), cls := "nm-item")(
              splitNumber(trans.site.`nbStudies`.pluralSame(info.nbStudies))
            )
          ),
          (ctx.kid.no && info.nbForumPosts > 0).option(
            a(
              cls := "nm-item",
              href := routes.ForumPost.search("user:" + u.username, 1).url
            )(
              splitNumber(trans.site.nbForumPosts.pluralSame(info.nbForumPosts))
            )
          ),
          (ctx.kid.no && (info.ublog.exists(_.nbPosts > 0) || ctx.is(u))).option(
            a(
              cls := "nm-item",
              href := routes.Ublog.index(u.username)
            )(
              splitNumber(trans.ublog.blogPosts.pluralSame(info.ublog.so(_.nbPosts)))
            )
          ),
          (ctx.isAuth && ctx.isnt(u))
            .option(a(cls := "nm-item note-zone-toggle")(splitNumber(s"${social.notes.size} Notes")))
        ),
        div(
          cls := "user-actions dropdown-overflow",
          attr("data-menu") := userActionsMenu(u, social).serialize
        )
      ),
      ctx.isnt(u).option(noteUi.zone(u, social.notes)),
      isGranted(_.UserModView).option(div(cls := "mod-zone mod-zone-full none")),
      standardFlash,
      angle match
        case UserInfo.Angle.Games(Some(searchForm)) => views.gameSearch.user(u, searchForm)
        case _ =>
          val profile = u.profileOrDefault
          val muted = u.marks.troll && ctx.isnt(u)
          val showProfile =
            ctx.kid.no && u.kid.no && !muted && (showLinks || !profile.hasLinks) || isGranted(_.AccountInfo)
          div(id := "us_profile")(
            if info.ratingChart.isDefined && (!u.lame || ctx.is(u) || isGranted(_.AccountInfo)) then
              views.user.perfStat.ratingHistoryContainer
            else (ctx.is(u) && u.count.game < 10).option(ui.newPlayer(u)),
            div(cls := "profile-side")(
              div(cls := "user-infos")(
                (u.lame && ctx.isnt(u)).option:
                  div(cls := "warning tos_warning")(
                    span(dataIcon := Icon.CautionCircle, cls := "is4"),
                    trans.site.thisAccountViolatedTos()
                  )
                ,
                showProfile
                  .so(profile.nonEmptyRealName)
                  .map(strong(cls := List("name" -> true, "muted" -> muted))(_)),
                info.publicFideId.map: id =>
                  p(a(href := routes.Fide.show(id, u.username.value))("FIDE player #" + id)),
                (showLinks && showProfile || isGranted(_.AccountInfo))
                  .so(profile.nonEmptyBio)
                  .map: bio =>
                    p(cls := List("bio" -> true, "muted" -> muted))(richText(bio, nl2br = true)),
                env.noSweat.botPolicy(u.id).map(views.noSweatBot(_)),
                div(cls := "stats")(
                  profile.officialRating.map: r =>
                    div(r.name.toUpperCase, " rating: ", strong(r.rating)),
                  div(cls := "location")(
                    profile.nonEmptyLocation
                      .ifTrue(showProfile)
                      .map: l =>
                        span(cls := List("muted" -> muted))(l),
                    profile.flagInfo.map: c =>
                      frag(
                        img(cls := "flag", src := assetPath(s"flags/${c.code}.webp")),
                        c.name
                      )
                  ),
                  p(cls := "thin")(trans.site.memberSince(), " ", showDate(u.createdAt)),
                  u.seenAt.map: seen =>
                    p(cls := "thin")(trans.site.lastSeenActive(momentFromNow(seen))),
                  ctx
                    .is(u)
                    .option(
                      a(href := routes.Account.profile, title := trans.site.editProfile.txt())(
                        trans.site.profileCompletion(s"${profile.completionPercent}%")
                      )
                    ),
                  u.playTime.map: playTime =>
                    frag(
                      p(
                        title := translator.duration(playTime.totalDuration, None, true)
                      )(
                        trans.site.tpTimeSpentPlaying(
                          translator.duration(playTime.totalDuration)
                        )
                      ),
                      playTime.nonEmptyTvDuration.map: tvDuration =>
                        p(
                          title := translator.duration(tvDuration, None, true)
                        )(trans.site.tpTimeSpentOnTV(translator.duration(tvDuration)))
                    ),
                  (!muted && u.kid.no).option(
                    div(cls := "social_links col2")(
                      showLinks
                        .option(profile.actualLinks)
                        .filter(_.nonEmpty)
                        .map: links =>
                          frag(
                            strong(trans.site.socialMediaLinks()),
                            links.map: link =>
                              a(href := link.url, targetBlank, noFollow, relMe)(link.site.name)
                          )
                    )
                  ),
                  (ctx.is(u) || u.kid.no).option(
                    div(cls := "teams col2")(
                      info.teamIds.nonEmpty.option(strong(trans.team.teams())),
                      info.teamIds
                        .sorted(using stringOrdering)
                        .map: t =>
                          teamLink(t, withIcon = false)
                    )
                  )
                )
              ),
              info.insightVisible.option(
                a(cls := "insight", href := routes.Insight.index(u.username), dataIcon := Icon.Target):
                  span(
                    strong("Chess Insights"),
                    em("Analytics from ", if ctx.is(u) then "your" else s"${u.username}'s", " games")
                  )
              )
            )
          )
      ,
      (ctx.kid.no && info.ublog.so(_.latests).nonEmpty).option(
        div(cls := "user-show__blog ublog-post-cards")(
          info.ublog.so(_.latests).map(views.ublog.ui.card(_))
        )
      ),
      (!UserId.isOfficial(u.id)).option:
        div(cls := "angles number-menu number-menu--tabs menu-box-pop")(
          a(
            dataTab := "activity",
            cls := List(
              "nm-item to-activity" -> true,
              "active" -> (angle == UserInfo.Angle.Activity)
            ),
            href := routes.User.show(u.username)
          )(trans.activity.activity()),
          a(
            dataTab := "games",
            cls := List(
              "nm-item to-games" -> true,
              "active" -> (angle.key == "games")
            ),
            href := routes.User.gamesAll(u.username)
          )(
            trans.site.nbGames.plural(info.user.count.game, info.user.count.game.localize),
            (info.nbs.playing > 0).option(
              span(
                cls := "unread",
                title := trans.site.nbPlaying.pluralTxt(info.nbs.playing, info.nbs.playing.localize)
              )(info.nbs.playing)
            )
          )
        )
    )
