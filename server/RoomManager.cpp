/*****************************************************************//**
 * \file   RoomManager.cpp
 * \brief  Room manager implementation for the browser-based Gomoku Arena project.
 * 
 * \author B11201116
 * \date   2026/4/1
 *********************************************************************/

#include "RoomManager.h"

#include <random>

/**
 * \brief Create a new room and insert the first player.
 * 
 * \param playerName Display name selected by the first player
 * \param avatarId Avatar ID selected by the first player
 * \param settings Room settings
 * \param roomId Output room ID
 * \param createdPlayer Output player information
 * \return Shared pointer to the created room
 */
std::shared_ptr<GameRoom> RoomManager::createRoom(const std::string& playerName,
                                                  const std::string& avatarId,
                                                  const RoomSettings& settings,
                                                  std::string& roomId,
                                                  PlayerInfo& createdPlayer)
{
    roomId = generateRoomId();

    std::shared_ptr<GameRoom> room = std::make_shared<GameRoom>(roomId, settings);
    const std::optional<PlayerInfo> player = room->addPlayer(playerName, avatarId);

    createdPlayer = *player;
    m_rooms[roomId] = room;

    return room;
}

/**
 * \brief Find one room by room ID.
 * 
 * \param roomId Room ID string
 * \return Matching room, or nullptr if not found
 */
std::shared_ptr<GameRoom> RoomManager::findRoom(const std::string& roomId)
{
    return static_cast<const RoomManager&>(*this).findRoom(roomId);
}

/**
 * \brief Find one room by room ID.
 * 
 * \param roomId Room ID string
 * \return Matching room, or nullptr if not found
 */
std::shared_ptr<GameRoom> RoomManager::findRoom(const std::string& roomId) const
{
    const auto iterator = m_rooms.find(roomId);

    if (iterator == m_rooms.end())
    {
        return nullptr;
    }

    return iterator->second;
}

/**
 * \brief Join an existing room.
 * 
 * \param roomId Target room ID
 * \param playerName Display name selected by the joining player
 * \param avatarId Avatar ID selected by the joining player
 * \return Created player info, or std::nullopt on failure
 */
std::optional<PlayerInfo> RoomManager::joinRoom(const std::string& roomId,
                                                const std::string& playerName,
                                                const std::string& avatarId)
{
    std::shared_ptr<GameRoom> room = findRoom(roomId);

    if (room == nullptr)
    {
        return std::nullopt;
    }

    return room->addPlayer(playerName, avatarId);
}

/**
 * \brief Remove one player from a room.
 * 
 * \param roomId Target room ID
 * \param token Private player token
 */
void RoomManager::leaveRoom(const std::string& roomId, const std::string& token)
{
    std::shared_ptr<GameRoom> room = findRoom(roomId);

    if (room == nullptr)
    {
        return;
    }

    room->removePlayer(token);
}

/**
 * \brief Generate one six-digit room ID.
 * 
 * \return Generated room ID string
 */
std::string RoomManager::generateRoomId() const
{
    static std::mt19937 randomEngine(static_cast<unsigned int>(std::random_device{}()));
    static const char DIGITS[] = "0123456789";

    std::string roomId;
    roomId.reserve(6);

    for (int index = 0; index < 6; ++index)
    {
        roomId.push_back(DIGITS[randomEngine() % 10]);
    }

    return roomId;
}
