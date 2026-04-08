/*****************************************************************//**
 * \file   RoomManager.h
 * \brief  Room manager declarations for the browser-based Gomoku Arena project.
 * 
 * \author B11201116
 * \date   2026/4/1
 *********************************************************************/

#ifndef ROOMMANAGER_H
#define ROOMMANAGER_H

#include "GameRoom.h"

#include <map>
#include <memory>
#include <optional>
#include <string>

/**
 * \brief Manages all active Gomoku rooms.
 */
class RoomManager
{
public:
    /**
     * \brief Construct a default room manager.
     */
    RoomManager() = default;

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
    std::shared_ptr<GameRoom> createRoom(const std::string& playerName,
                                         const std::string& avatarId,
                                         const RoomSettings& settings,
                                         std::string& roomId,
                                         PlayerInfo& createdPlayer);

    /**
     * \brief Find one room by room ID.
     * 
     * \param roomId Room ID string
     * \return Matching room, or nullptr if not found
     */
    std::shared_ptr<GameRoom> findRoom(const std::string& roomId);

    /**
     * \brief Find one room by room ID.
     * 
     * \param roomId Room ID string
     * \return Matching room, or nullptr if not found
     */
    std::shared_ptr<GameRoom> findRoom(const std::string& roomId) const;

    /**
     * \brief Join an existing room.
     * 
     * \param roomId Target room ID
     * \param playerName Display name selected by the joining player
     * \param avatarId Avatar ID selected by the joining player
     * \return Created player info, or std::nullopt on failure
     */
    std::optional<PlayerInfo> joinRoom(const std::string& roomId,
                                       const std::string& playerName,
                                       const std::string& avatarId);

    /**
     * \brief Remove one player from a room.
     * 
     * \param roomId Target room ID
     * \param token Private player token
     */
    void leaveRoom(const std::string& roomId, const std::string& token);

private:
    /**
     * \brief Generate one six-digit room ID.
     * 
     * \return Generated room ID string
     */
    std::string generateRoomId() const;

private:
    std::map<std::string, std::shared_ptr<GameRoom>> m_rooms;
};

#endif
