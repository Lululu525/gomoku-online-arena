/*****************************************************************//**
 * \file   GameRoom.cpp
 * \brief  Game room logic implementation for the browser-based Gomoku Arena project.
 * 
 * \author B11201116
 * \date   2026/4/1
 *********************************************************************/

#include "GameRoom.h"

#include <random>
#include <sstream>

/**
 * \brief Construct a room with the provided ID and settings.
 * 
 * \param roomId Room ID string
 * \param settings Room configuration
 */
GameRoom::GameRoom(const std::string& roomId, const RoomSettings& settings)
    : m_roomId(roomId),
      m_settings(settings)
{
    resetBoard();
    resetTurnTimer();
}

/**
 * \brief Add a player to the room.
 * 
 * \param playerName Display name selected by the player
 * \param avatarId Avatar ID selected by the player
 * \return Created player information, or std::nullopt if room is full
 */
std::optional<PlayerInfo> GameRoom::addPlayer(const std::string& playerName, const std::string& avatarId)
{
    PlayerInfo newPlayer;
    newPlayer.name = playerName.empty() ? "Player" : playerName;
    newPlayer.token = generateToken();
    newPlayer.avatarId = avatarId.empty() ? "dog" : avatarId;

    if (!m_blackPlayer.has_value())
    {
        newPlayer.color = BLACK;
        m_blackPlayer = newPlayer;
        m_notice = "黑棋已加入房間，等待白棋加入。";
        return newPlayer;
    }

    if (!m_whitePlayer.has_value())
    {
        newPlayer.color = WHITE;
        m_whitePlayer = newPlayer;
        m_notice = "兩位玩家已就緒，黑棋先行。";
        resetTurnTimer();
        return newPlayer;
    }

    return std::nullopt;
}

/**
 * \brief Remove a player from the room by token.
 * 
 * \param token Private player token
 */
void GameRoom::removePlayer(const std::string& token)
{
    bool playerRemoved = false;
    std::string leaveMessage;

    if (m_blackPlayer.has_value() && m_blackPlayer->token == token)
    {
        m_blackPlayer.reset();
        leaveMessage = "黑棋玩家已離開房間。";
        playerRemoved = true;
    }
    else if (m_whitePlayer.has_value() && m_whitePlayer->token == token)
    {
        m_whitePlayer.reset();
        leaveMessage = "白棋玩家已離開房間。";
        playerRemoved = true;
    }

    if (!playerRemoved)
    {
        return;
    }

    resetBoard();
    m_notice = leaveMessage + " 房間已重置，等待新的玩家加入。";
}

/**
 * \brief Place one move on the board.
 * 
 * \param token Private player token
 * \param row Target row index
 * \param col Target column index
 * \param errorMessage Output error message when move fails
 * \return True if move succeeds, otherwise false
 */
bool GameRoom::placeMove(const std::string& token, int row, int col, std::string& errorMessage)
{
    updateTimerState();

    const int playerColor = getPlayerColor(token);

    if (m_gameOver)
    {
        errorMessage = "本局已結束。";
        return false;
    }

    if (!m_blackPlayer.has_value() || !m_whitePlayer.has_value())
    {
        errorMessage = "請等待另一位玩家加入。";
        return false;
    }

    if (playerColor == NONE)
    {
        errorMessage = "無效的玩家身分。";
        return false;
    }

    if (playerColor != m_currentPlayer)
    {
        errorMessage = "現在不是你的回合。";
        return false;
    }

    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE)
    {
        errorMessage = "落子位置超出範圍。";
        return false;
    }

    if (m_board[row][col] != NONE)
    {
        errorMessage = "該位置已經有棋子。";
        return false;
    }

    m_board[row][col] = playerColor;
    m_history.push_back({row, col, playerColor});
    m_lastMoveRow = row;
    m_lastMoveCol = col;

    m_restartRequestedByBlack = false;
    m_restartRequestedByWhite = false;
    m_undoRequestedByBlack = false;
    m_undoRequestedByWhite = false;

    if (checkWinner(row, col, playerColor))
    {
        m_winner = playerColor;
        m_gameOver = true;
        m_notice = (playerColor == BLACK) ? "Black wins the game." : "White wins the game.";
        return true;
    }

    m_currentPlayer = (m_currentPlayer == BLACK) ? WHITE : BLACK;
    m_notice = (m_currentPlayer == BLACK) ? "輪到黑棋。" : "輪到白棋。";
    resetTurnTimer();

    return true;
}

/**
 * \brief Request to restart the current room.
 * 
 * \param token Private player token
 */
void GameRoom::requestRestart(const std::string& token)
{
    if (m_history.empty())
    {
        return;
    }

    const int playerColor = getPlayerColor(token);

    if (playerColor == BLACK)
    {
        m_restartRequestedByBlack = true;
        m_notice = "黑棋要求重新開始。";
    }
    else if (playerColor == WHITE)
    {
        m_restartRequestedByWhite = true;
        m_notice = "白棋要求重新開始。";
    }
}

/**
 * \brief Respond to a restart request.
 * 
 * \param token Private player token
 * \param accepted True if the player accepts the request
 */
void GameRoom::respondRestart(const std::string& token, bool accepted)
{
    const int playerColor = getPlayerColor(token);

    if (!accepted)
    {
        m_restartRequestedByBlack = false;
        m_restartRequestedByWhite = false;
        m_notice = "重新開始請求已被拒絕。";
        return;
    }

    if (playerColor == BLACK)
    {
        m_restartRequestedByBlack = true;
    }
    else if (playerColor == WHITE)
    {
        m_restartRequestedByWhite = true;
    }

    if (m_restartRequestedByBlack && m_restartRequestedByWhite)
    {
        resetBoard();
        m_notice = "新的一局已開始，黑棋先行。";
    }
    else
    {
        m_notice = "已接受重新開始請求。";
    }
}

/**
 * \brief Request to undo one move.
 * 
 * \param token Private player token
 * \param errorMessage Output error message when request fails
 * \return True if request succeeds, otherwise false
 */
bool GameRoom::requestUndo(const std::string& token, std::string& errorMessage)
{
    const int playerColor = getPlayerColor(token);

    if (!m_settings.undoEnabled)
    {
        errorMessage = "本房間未啟用悔棋功能。";
        return false;
    }

    if (m_gameOver)
    {
        errorMessage = "勝負已分，不能再要求悔棋。";
        return false;
    }

    if (playerColor == NONE)
    {
        errorMessage = "無效的玩家身分。";
        return false;
    }

    if (m_history.empty())
    {
        errorMessage = "目前沒有可悔的棋。";
        return false;
    }

    if (playerColor != m_currentPlayer)
    {
        errorMessage = "只有在自己的回合才可以要求悔棋。";
        return false;
    }

    if (!hasPlayerMoved(playerColor))
    {
        errorMessage = "你在這一局尚未下過棋，不能要求悔棋。";
        return false;
    }

    if (m_history.back().color == playerColor)
    {
        errorMessage = "目前不能悔自己的最新一步。";
        return false;
    }

    if (playerColor == BLACK)
    {
        m_undoRequestedByBlack = true;
        m_notice = "黑棋要求悔棋。";
    }
    else
    {
        m_undoRequestedByWhite = true;
        m_notice = "白棋要求悔棋。";
    }

    return true;
}

/**
 * \brief Respond to an undo request.
 * 
 * \param token Private player token
 * \param accepted True if the player accepts the request
 */
void GameRoom::respondUndo(const std::string& token, bool accepted)
{
    const int playerColor = getPlayerColor(token);

    if (!accepted)
    {
        m_undoRequestedByBlack = false;
        m_undoRequestedByWhite = false;
        m_notice = "悔棋請求已被拒絕。";
        return;
    }

    if (playerColor == BLACK)
    {
        m_undoRequestedByBlack = true;
    }
    else if (playerColor == WHITE)
    {
        m_undoRequestedByWhite = true;
    }

    if (m_undoRequestedByBlack && m_undoRequestedByWhite)
    {
        applyUndo();
        m_notice = "已完成悔棋。";
    }
    else
    {
        m_notice = "已接受悔棋請求。";
    }
}

/**
 * \brief Get a complete room snapshot for frontend rendering.
 * 
 * \return Current room snapshot
 */
RoomSnapshot GameRoom::getSnapshot()
{
    updateTimerState();

    RoomSnapshot snapshot;
    snapshot.roomId = m_roomId;

    snapshot.hasBlack = m_blackPlayer.has_value();
    snapshot.hasWhite = m_whitePlayer.has_value();

    snapshot.blackName = snapshot.hasBlack ? m_blackPlayer->name : "";
    snapshot.whiteName = snapshot.hasWhite ? m_whitePlayer->name : "";
    snapshot.blackAvatarId = snapshot.hasBlack ? m_blackPlayer->avatarId : "dog";
    snapshot.whiteAvatarId = snapshot.hasWhite ? m_whitePlayer->avatarId : "dog";

    snapshot.currentPlayer = m_currentPlayer;
    snapshot.winner = m_winner;
    snapshot.gameOver = m_gameOver;

    snapshot.timerEnabled = m_settings.timerEnabled;
    snapshot.turnSeconds = m_settings.turnSeconds;
    snapshot.undoEnabled = m_settings.undoEnabled && !m_gameOver;
    snapshot.remainingSeconds = m_settings.turnSeconds;

    if (m_settings.timerEnabled && !m_gameOver && m_blackPlayer.has_value() && m_whitePlayer.has_value())
    {
        const auto now = std::chrono::steady_clock::now();
        const auto elapsedSeconds = static_cast<int>(
            std::chrono::duration_cast<std::chrono::seconds>(now - m_turnStartTime).count());
        const int remainingSeconds = m_settings.turnSeconds - elapsedSeconds;
        snapshot.remainingSeconds = (remainingSeconds > 0) ? remainingSeconds : 0;
    }

    snapshot.restartRequestedByBlack = m_restartRequestedByBlack;
    snapshot.restartRequestedByWhite = m_restartRequestedByWhite;
    snapshot.undoRequestedByBlack = m_undoRequestedByBlack;
    snapshot.undoRequestedByWhite = m_undoRequestedByWhite;
    snapshot.replayAllowed = !m_history.empty();
    snapshot.notice = m_notice;
    snapshot.lastMoveRow = m_lastMoveRow;
    snapshot.lastMoveCol = m_lastMoveCol;
    snapshot.board = m_board;
    snapshot.history = m_history;

    return snapshot;
}

/**
 * \brief Get the player color that belongs to the token.
 * 
 * \param token Private player token
 * \return BLACK, WHITE, or NONE
 */
int GameRoom::getPlayerColor(const std::string& token) const
{
    if (m_blackPlayer.has_value() && m_blackPlayer->token == token)
    {
        return BLACK;
    }

    if (m_whitePlayer.has_value() && m_whitePlayer->token == token)
    {
        return WHITE;
    }

    return NONE;
}

/**
 * \brief Check whether the player can currently request undo.
 * 
 * \param token Private player token
 * \return True if undo is currently allowed for this player
 */
bool GameRoom::canPlayerRequestUndo(const std::string& token) const
{
    const int playerColor = getPlayerColor(token);

    if (!m_settings.undoEnabled || m_gameOver)
    {
        return false;
    }

    if (playerColor == NONE || m_history.empty())
    {
        return false;
    }

    if (playerColor != m_currentPlayer)
    {
        return false;
    }

    if (!hasPlayerMoved(playerColor))
    {
        return false;
    }

    if (m_history.back().color == playerColor)
    {
        return false;
    }

    return true;
}

/**
 * \brief Reset the board for a new round.
 */
void GameRoom::resetBoard()
{
    for (int row = 0; row < BOARD_SIZE; ++row)
    {
        for (int col = 0; col < BOARD_SIZE; ++col)
        {
            m_board[row][col] = NONE;
        }
    }

    m_history.clear();
    m_currentPlayer = BLACK;
    m_winner = NONE;
    m_gameOver = false;
    m_lastMoveRow = -1;
    m_lastMoveCol = -1;

    m_restartRequestedByBlack = false;
    m_restartRequestedByWhite = false;
    m_undoRequestedByBlack = false;
    m_undoRequestedByWhite = false;

    resetTurnTimer();
}

/**
 * \brief Apply one approved undo action.
 */
void GameRoom::applyUndo()
{
    if (m_history.empty())
    {
        return;
    }

    const Move lastMove = m_history.back();
    m_history.pop_back();
    m_board[lastMove.row][lastMove.col] = NONE;

    m_lastMoveRow = -1;
    m_lastMoveCol = -1;

    if (!m_history.empty())
    {
        m_lastMoveRow = m_history.back().row;
        m_lastMoveCol = m_history.back().col;
    }

    m_currentPlayer = lastMove.color;
    m_winner = NONE;
    m_gameOver = false;

    m_undoRequestedByBlack = false;
    m_undoRequestedByWhite = false;
    m_restartRequestedByBlack = false;
    m_restartRequestedByWhite = false;

    resetTurnTimer();
}

/**
 * \brief Check whether the given move wins the game.
 * 
 * \param row Move row index
 * \param col Move column index
 * \param color Stone color
 * \return True if the move forms five in a row
 */
bool GameRoom::checkWinner(int row, int col, int color) const
{
    const int horizontal = 1 + countDirection(row, col, 0, 1, color) + countDirection(row, col, 0, -1, color);
    const int vertical = 1 + countDirection(row, col, 1, 0, color) + countDirection(row, col, -1, 0, color);
    const int diagonalOne = 1 + countDirection(row, col, 1, 1, color) + countDirection(row, col, -1, -1, color);
    const int diagonalTwo = 1 + countDirection(row, col, 1, -1, color) + countDirection(row, col, -1, 1, color);

    return horizontal >= 5 || vertical >= 5 || diagonalOne >= 5 || diagonalTwo >= 5;
}

/**
 * \brief Count stones continuously in one direction.
 * 
 * \param row Start row
 * \param col Start column
 * \param rowDelta Row direction delta
 * \param colDelta Column direction delta
 * \param color Stone color
 * \return Continuous stone count
 */
int GameRoom::countDirection(int row, int col, int rowDelta, int colDelta, int color) const
{
    int count = 0;
    int currentRow = row + rowDelta;
    int currentCol = col + colDelta;

    while (currentRow >= 0 && currentRow < BOARD_SIZE &&
           currentCol >= 0 && currentCol < BOARD_SIZE &&
           m_board[currentRow][currentCol] == color)
    {
        ++count;
        currentRow += rowDelta;
        currentCol += colDelta;
    }

    return count;
}

/**
 * \brief Refresh timer related state and timeout behavior.
 */
void GameRoom::updateTimerState()
{
    if (!m_settings.timerEnabled || m_gameOver)
    {
        return;
    }

    if (!m_blackPlayer.has_value() || !m_whitePlayer.has_value())
    {
        return;
    }

    const auto now = std::chrono::steady_clock::now();
    const int elapsedSeconds = static_cast<int>(
        std::chrono::duration_cast<std::chrono::seconds>(now - m_turnStartTime).count());

    if (elapsedSeconds >= m_settings.turnSeconds)
    {
        m_notice = (m_currentPlayer == BLACK) ? "黑棋超時，已跳過本手。" : "白棋超時，已跳過本手。";
        m_currentPlayer = (m_currentPlayer == BLACK) ? WHITE : BLACK;

        m_undoRequestedByBlack = false;
        m_undoRequestedByWhite = false;

        resetTurnTimer();
    }
}

/**
 * \brief Reset the timer for the next turn.
 */
void GameRoom::resetTurnTimer()
{
    m_turnStartTime = std::chrono::steady_clock::now();
}

/**
 * \brief Generate one random player token.
 * 
 * \return Random token string
 */
std::string GameRoom::generateToken() const
{
    static std::mt19937 randomEngine(static_cast<unsigned int>(std::random_device{}()));
    static const char TOKEN_CHARS[] =
        "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

    std::string token;
    token.reserve(24);

    for (int index = 0; index < 24; ++index)
    {
        token.push_back(TOKEN_CHARS[randomEngine() % (sizeof(TOKEN_CHARS) - 1)]);
    }

    return token;
}

/**
 * \brief Get the player pointer that matches the color.
 * 
 * \param color Target player color
 * \return Pointer to matching player, or nullptr
 */
PlayerInfo* GameRoom::getPlayerByColor(int color)
{
    if (color == BLACK && m_blackPlayer.has_value())
    {
        return &(*m_blackPlayer);
    }

    if (color == WHITE && m_whitePlayer.has_value())
    {
        return &(*m_whitePlayer);
    }

    return nullptr;
}

/**
 * \brief Get the player pointer that matches the color.
 * 
 * \param color Target player color
 * \return Const pointer to matching player, or nullptr
 */
const PlayerInfo* GameRoom::getPlayerByColor(int color) const
{
    if (color == BLACK && m_blackPlayer.has_value())
    {
        return &(*m_blackPlayer);
    }

    if (color == WHITE && m_whitePlayer.has_value())
    {
        return &(*m_whitePlayer);
    }

    return nullptr;
}

/**
 * \brief Get the player pointer that matches the token.
 * 
 * \param token Private player token
 * \return Pointer to matching player, or nullptr
 */
PlayerInfo* GameRoom::getPlayerByToken(const std::string& token)
{
    if (m_blackPlayer.has_value() && m_blackPlayer->token == token)
    {
        return &(*m_blackPlayer);
    }

    if (m_whitePlayer.has_value() && m_whitePlayer->token == token)
    {
        return &(*m_whitePlayer);
    }

    return nullptr;
}

/**
 * \brief Get the player pointer that matches the token.
 * 
 * \param token Private player token
 * \return Const pointer to matching player, or nullptr
 */
const PlayerInfo* GameRoom::getPlayerByToken(const std::string& token) const
{
    if (m_blackPlayer.has_value() && m_blackPlayer->token == token)
    {
        return &(*m_blackPlayer);
    }

    if (m_whitePlayer.has_value() && m_whitePlayer->token == token)
    {
        return &(*m_whitePlayer);
    }

    return nullptr;
}

/**
 * \brief Check whether the given color has placed at least one move.
 * 
 * \param color Target player color
 * \return True if the player has already played before
 */
bool GameRoom::hasPlayerMoved(int color) const
{
    for (const Move& move : m_history)
    {
        if (move.color == color)
        {
            return true;
        }
    }

    return false;
}
