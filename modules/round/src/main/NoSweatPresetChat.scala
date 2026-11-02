package lila.round

import lila.chat.ChatApi
import lila.db.dsl.{ *, given }
import lila.round.RoundGame.*

/** Only persisted, admitted human-versus-Maia games use this bounded adapter. */
final class NoSweatPresetChat(records: Coll, getGame: GameId => Fu[Option[Game]], api: ChatApi)(using
    Executor
):
  import NoSweatPresetChat.*

  private def session(game: Game): Fu[Option[Session]] =
    records
      .byId[Bdoc](game.id)
      .dmap:
        _.flatMap: doc =>
          for
            color <- doc.getAsOpt[String]("humanColor").flatMap(Color.fromName)
            bot <- doc.getAsOpt[UserId]("bot")
            human = doc.getAsOpt[UserId]("human")
            if game.hasChat && game.sourceIs(_.Pool) &&
              !doc.getAsOpt[Boolean]("automatic").contains(true) &&
              game.player(color).userId == human && game.player(!color).userId.contains(bot)
          yield Session(color, human, bot)

  def restricted(game: Game): Fu[Boolean] = session(game).dmap(_.isDefined)

  /** None preserves native friend chat; Some also consumes invalid Maia messages. */
  def post(gameId: GameId, sender: Either[UserId, Color], text: String): Fu[Option[Unit]] =
    getGame(gameId).flatMap:
      case None => fuccess(().some)
      case Some(game) =>
        session(game).flatMap:
          case None => fuccess(none)
          case Some(s) =>
            replyFor(s, sender, game.finished, game.ply.value, text)
              .fold(funit): (group, reply) =>
                val chatId = gameId.into(ChatId)
                respond(
                  () =>
                    sender.fold(
                      api.userChat.writeAccepted(chatId, _, text, none, _.round),
                      api.playerChat.writeAccepted(chatId, _, text, _.round)
                    ),
                  () =>
                    records.update
                      .one(
                        bid(gameId) ++ bdoc(
                          s"presetChat.$group" -> bdoc("$ne" -> text),
                          s"presetChat.$group.1" -> bdoc("$exists" -> false)
                        ),
                        bdoc("$push" -> bdoc(s"presetChat.$group" -> text))
                      )
                      .dmap(_.nModified == 1),
                  () => api.userChat.write(chatId, s.bot, reply, none, _.round)
                )
              .inject(().some)

private[round] object NoSweatPresetChat:
  case class Session(color: Color, human: Option[UserId], bot: UserId)

  private val start = Map(
    "Hello" -> "hi",
    "Good luck" -> "you too!",
    "Have fun!" -> "you too!",
    "You too!" -> "thanks!"
  )
  private val end = Map(
    "Good game" -> "ty, gg",
    "Well played" -> "thank you!",
    "Thank you" -> "you're welcome",
    "I've got to go" -> "thanks for the game",
    "Bye!" -> "bye!"
  )

  def replyFor(
      s: Session,
      sender: Either[UserId, Color],
      finished: Boolean,
      ply: Int,
      text: String
  ): Option[(String, String)] =
    val authorized = sender.fold(id => s.human.contains(id), c => s.human.isEmpty && c == s.color)
    Option
      .when(authorized):
        if finished then end.get(text).map("end" -> _)
        else if ply < 5 then start.get(text).map("start" -> _)
        else none
      .flatten

  def respond(write: () => Fu[Boolean], claim: () => Fu[Boolean], reply: () => Funit)(using Executor): Funit =
    write().flatMap(accepted => accepted.so(claim().flatMap(fresh => fresh.so(reply()))))
