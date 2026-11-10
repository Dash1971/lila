package lila.round

import lila.core.game.{ Game, Pov }

/** Ask the native round to claim; never infer a disconnect or write a result here. */
private[round] object NoSweatAbandon:

  def apply(
      game: Game,
      managedBot: Option[UserId],
      healthyPoll: Boolean,
      socketStatus: Game => Fu[SocketStatus],
      claim: Pov => Unit,
      flag: Game => Unit
  )(using Executor): Funit =
    if !healthyPoll then funit
    else if game.outoftime(withGrace = true) then fuccess(flag(game))
    else
      managedBot
        .flatMap(id => Pov(game, id))
        .filter(pov => game.forceResignableNow && pov.mightClaimWin)
        .so: pov =>
          socketStatus(game).map: socket =>
            if socket.onGame(pov.color) && socket.isGone(!pov.color) then claim(pov)
