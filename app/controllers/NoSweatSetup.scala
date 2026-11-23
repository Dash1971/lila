package controllers

import lila.app.{ *, given }
import lila.common.HTTPRequest

/** Mute friend-admission policy; creation still uses native challenges and clocks. */
private[controllers] final class NoSweatSetup(env: Env, challengeC: => Challenge)
    extends LilaController(env)
    with lila.web.TheftPrevention:
  import env.setup.forms

  def friend(userId: Option[UserStr]) =
    OpenBody: ctx ?=>
      limit.setupPost.use(rateLimited()):
        bindForm(forms.friend)(
          doubleJsonFormError,
          config =>
            for
              origUser <- ctx.user.traverse(env.user.perfsRepo.withPerf(_, config.perfType))
              destUser <- userId.so(env.user.api.enabledWithPerf(_, config.perfType))
              denied <- destUser.so(u => env.challenge.granter.isDenied(u.user, config.perfKey.some))
              result <-
                if env.noSweat.enabled && config.makeClock.isEmpty then
                  fuccess(JsonBadRequest(lila.core.i18n.I18nKey.unchecked("muteRealTimeOnly").txt()))
                else if env.noSweat.enabled && !lila.game.NoSweatGameAdmission
                    .hasMinimumClock(config.makeClock)
                then fuccess(JsonBadRequest(lila.core.i18n.I18nKey.unchecked("muteMinimumClock").txt()))
                else if env.noSweat.enabled && (
                    origUser.isEmpty || destUser.isEmpty || origUser.exists(_.user.isBot) ||
                      destUser.exists(_.user.isBot) || destUser.exists(u => ctx.is(u.user)) ||
                      config.variant != chess.variant.Standard
                  )
                then fuccess(forbiddenJson("Choose a signed-in player for a standard chess challenge."))
                else
                  denied match
                    case Some(denied) =>
                      val message = lila.challenge.ChallengeDenied.translated(denied)
                      negotiate(
                        // 403 tells setupCtrl.ts to close the setup modal
                        forbiddenJson(message), // TODO test
                        JsonBadRequest(message)
                      )
                    case None =>
                      import lila.challenge.Challenge.*
                      (origUser, ctx.req.sid)
                        .match
                          case (Some(orig), _) => toRegistered(orig).some
                          case (_, Some(sid)) => Challenger.Anonymous(sid.value).some
                          case _ if HTTPRequest.isLichobile => Challenger.Open.some
                          case _ => none
                        .so: challenger =>
                          val timeControl = makeTimeControl(config.makeClock, config.makeDaysPerTurn)
                          val challenge = lila.challenge.Challenge.make(
                            variant = config.variant,
                            initialFen = config.fen,
                            timeControl = timeControl,
                            rated = config.rated,
                            color = config.color.name,
                            challenger = challenger,
                            destUser = destUser,
                            rematchOf = none
                          )
                          env.challenge.api
                            .create(challenge)
                            .flatMap:
                              if _ then
                                negotiate(
                                  Redirect(routes.Round.watcher(challenge.gameId, Color.white)),
                                  challengeC.showChallenge(challenge, justCreated = true)
                                )
                              else
                                negotiate(
                                  Redirect(routes.Lobby.home),
                                  JsonBadRequest("Challenge not created")
                                )
            yield result
        )
