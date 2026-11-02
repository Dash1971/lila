package lila.user

object NoSweatUserSearch:
  def read(raw: String): Option[String] =
    val term = raw.trim
    Option.when(
      !term.exists(_.isControl) && !term.matches("(?i)(nostr:)?nsec1.*") &&
        ((term.length >= 2 && term.length <= 30) || lila.core.NostrName.pubkeyFromNpub(term).isDefined)
    )(term)

  def literalPrefix(term: String): String = "^" + java.util.regex.Pattern.quote(term)
