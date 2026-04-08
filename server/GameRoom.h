/*****************************************************************//**
 * \file   GameRoom.h
 * \brief  Game room declarations for the browser-based Gomoku Arena project.
 * 
 * \author B11201116
 * \date   2026/4/1
 *********************************************************************/

#ifndef GAMEROOM_H
#define GAMEROOM_H

#include <array>
#include <chrono>
#include <optional>
#include <string>
#include <vector>

/**
 * \brief Board size for Gomoku.
 */
const int BOARD_SIZE = 15;

/**
 * \brief Maximum number of connected players in one room.
 */
const int MAX_PLAYER_COUNT = 2;

/**
 * \brief Stone color and player role values.
 */
enum PLAYER_COLOR
{
    NONE = 0,
    BLACK = 1,
    WHITE = 2
};

/**
 * \brief Settings used when creating a room.
 */
struct RoomSettings
{
    bool timerEnabled = false;
    int turnSeconds = 15;
    bool undoEnabled = true;
};

/**
 * \brief Information stored for each player.
 */
struct PlayerInfo
{
    std::string name;
    std::string token;
    std::string avatarId;
    int color = NONE;
};

/**
 * \brief Single move record on the board.
 */
struct Move
{
    int row = -1;
    int col = -1;
    int color = NONE;
};

/**
 * \brief Read-only game state snapshot sent to the frontend.
 */
struct RoomSnapshot
{
    std::string roomId;

    std::string blackName;
    std::string whiteName;
    std::string blackAvatarId;
    std::string whiteAvatarId;

    bool hasBlack = false;
    bool hasWhite = false;

    int currentPlayer = BLACK;
    int winner = NONE;
    bool gameOver = false;

    bool timerEnabled = false;
    int turnSeconds = 15;
    int remainingSeconds = 15;

    bool restartRequestedByBlack = false;
    bool restartRequestedByWhite = false;

    bool undoEnabled = true;
    bool undoRequestedByBlack = false;
    bool undoRequestedByWhite = false;

    bool replayAllowed = false;
    std::string notice;

    int lastMoveRow = -1;
    int lastMoveCol = -1;

    std::array<std::array<int, BOARD_SIZE>, BOARD_SIZE> board{};
    std::vector<Move> history;
};

/**
 * \brief Stores all game logic for one Gomoku room.
 */
class GameRoom
{
public:
    /**
     * \brief Construct a room with the provided ID and settings.
     * 
     * \param roomId Room ID string
     * \param settings Settings selected when the room was created
     */
    GameRoom(const std::string& roomId, const RoomSettings& settings);

    /**
     * \brief Add a player to the room.
     * 
     * \param playerName Display name selected by the player
     * \param avatarId Avatar ID selected by the player
     * \return Created player information, or std::nullopt if room is full
     */
    std::optional<PlayerInfo> addPlayer(const std::string& playerName, const std::string& avatarId);

    /**
     * \brief Remove a player from the room by token.
     * 
     * \param token Private player token
     */
    void removePlayer(const std::string& token);

    /**
     * \brief Place one move on the board.
     * 
     * \param token Private player token
     * \param row Target row index
     * \param col Target column index
     * \param errorMessage Output error message when move fails
     * \return True if move succeeds, otherwise false
     */
    bool placeMove(const std::string& token, int row, int col, std::string& errorMessage);

    /**
     * \brief Request to restart the current room.
     * 
     * \param token Private player token
     */
    void requestRestart(const std::string& token);

    /**
     * \brief Respond to a restart request.
     * 
     * \param token Private player token
     * \param accepted True if the player accepts the request
     */
    void respondRestart(const std::string& token, bool accepted);

    /**
     * \brief Request to undo one move.
     * 
     * \param token Private player token
     * \param errorMessage Output error message when request fails
     * \return True if request succeeds, otherwise false
     */
    bool requestUndo(const std::string& token, std::string& errorMessage);

    /**
     * \brief Respond to an undo request.
     * 
     * \param token Private player token
     * \param accepted True if the player accepts the request
     */
    void respondUndo(const std::string& token, bool accepted);

    /**
     * \brief Get a complete room snapshot for frontend rendering.
     * 
     * \return Current room snapshot
     */
    RoomSnapshot getSnapshot();

    /**
     * \brief Get the player color that belongs to the token.
     * 
     * \param token Private player token
     * \return BLACK, WHITE, or NONE
     */
    int getPlayerColor(const std::string& token) const;

    /**
     * \brief Check whether the player can currently request undo.
     * 
     * \param token Private player token
     * \return True if undo is currently allowed for this player
     */
    bool canPlayerRequestUndo(const std::string& token) const;

private:
    /**
     * \brief Reset the board for a new round.
     */
    void resetBoard();

    /**
     * \brief Apply one approved undo action.
     */
    void applyUndo();

    /**
     * \brief Check whether the given move wins the game.
     * 
     * \param row Move row index
     * \param col Move column index
     * \param color Stone color
     * \return True if the move forms five in a row
     */
    bool checkWinner(int row, int col, int color) const;

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
    int countDirection(int row, int col, int rowDelta, int colDelta, int color) const;

    /**
     * \brief Refresh timer related state and timeout behavior.
     */
    void updateTimerState();

    /**
     * \brief Reset the timer for the next turn.
     */
    void resetTurnTimer();

    /**
     * \brief Generate one random player token.
     * 
     * \return Random token string
     */
    std::string generateToken() const;

    /**
     * \brief Get the player pointer that matches the color.
     * 
     * \param color Target player color
     * \return Pointer to matching player, or nullptr
     */
    PlayerInfo* getPlayerByColor(int color);

    /**
     * \brief Get the player pointer that matches the color.
     * 
     * \param color Target player color
     * \return Const pointer to matching player, or nullptr
     */
    const PlayerInfo* getPlayerByColor(int color) const;

    /**
     * \brief Get the player pointer that matches the token.
     * 
     * \param token Private player token
     * \return Pointer to matching player, or nullptr
     */
    PlayerInfo* getPlayerByToken(const std::string& token);

    /**
     * \brief Get the player pointer that matches the token.
     * 
     * \param token Private player token
     * \return Const pointer to matching player, or nullptr
     */
    const PlayerInfo* getPlayerByToken(const std::string& token) const;

    /**
     * \brief Check whether the given color has placed at least one move.
     * 
     * \param color Target player color
     * \return True if the player has already played before
     */
    bool hasPlayerMoved(int color) const;

private:
    std::string m_roomId;
    RoomSettings m_settings;

    std::array<std::array<int, BOARD_SIZE>, BOARD_SIZE> m_board{};
    std::vector<Move> m_history;

    std::optional<PlayerInfo> m_blackPlayer;
    std::optional<PlayerInfo> m_whitePlayer;

    int m_currentPlayer = BLACK;
    int m_winner = NONE;
    bool m_gameOver = false;

    int m_lastMoveRow = -1;
    int m_lastMoveCol = -1;

    bool m_restartRequestedByBlack = false;
    bool m_restartRequestedByWhite = false;

    bool m_undoRequestedByBlack = false;
    bool m_undoRequestedByWhite = false;

    std::string m_notice;
    std::chrono::steady_clock::time_point m_turnStartTime;
};

#endif
