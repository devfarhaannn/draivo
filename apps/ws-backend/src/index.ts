import { WebSocket, WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";
import { prisma } from "@repo/db/client";

const wss = new WebSocketServer({
    port: 8080,
});

interface User {
    ws: WebSocket;
    rooms: number[];
    userId: string;
}

const users: User[] = [];



// LIVE CANVAS STATE


//  Keep the latest canvas for every room while this server is running.
//  Later, we can persist this state in the database so it survives a
//  WebSocket server restart.




const roomCanvases = new Map<number, unknown[]>();

const MAX_CANVAS_ELEMENTS = 10_000;
const MAX_CANVAS_SIZE = 4 * 1024 * 1024;

// CHECK JWT TOKEN


function checkUser(token: string): string | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        if (typeof decoded === "string") {
            return null;
        }

        if (!decoded || !decoded.userId) {
            return null;
        }

        return decoded.userId;
    } catch {
        return null;
    }
}


/*
| ERROR HELPER
*/


function sendError(
    ws: WebSocket,
    message: string
) {
    if (ws.readyState !== WebSocket.OPEN) {
        return;
    }

    ws.send(
        JSON.stringify({
            type: "error",
            message,
        })
    );
}


 //ROOM BROADCAST HELPER


function broadcastToRoom(
    roomId: number,
    payload: Record<string, unknown>,
    excludeSocket?: WebSocket
) {
    for (const roomUser of users) {
        if (
            roomUser.ws !== excludeSocket &&
            roomUser.rooms.includes(roomId) &&
            roomUser.ws.readyState === WebSocket.OPEN
        ) {
            roomUser.ws.send(
                JSON.stringify(payload)
            );
        }
    }
}



// PARTICIPANT COUNT



function getRoomParticipantCount(
    roomId: number
): number {
    return users.filter(
        (roomUser) =>
            roomUser.rooms.includes(roomId) &&
            roomUser.ws.readyState === WebSocket.OPEN
    ).length;
}

function broadcastRoomPresence(
    roomId: number
) {
    broadcastToRoom(roomId, {
        type: "room_presence",
        roomId,
        participants: getRoomParticipantCount(roomId),
    });
}


  //WEBSOCKET CONNECTION


wss.on("connection", (ws, request) => {

    const url = request.url;

    if (!url) {
        ws.close();
        return;
    }

    //READ JWT TOKEN
  

    const queryParams = new URLSearchParams(
        url.split("?")[1]
    );

    const token = queryParams.get("token") || "";

   
   
    //VERIFY USER
   

    const userId = checkUser(token);

    if (!userId) {

        sendError(
            ws,
            "Unauthorized"
        );

        ws.close();

        return;
    }

     //REGISTER CONNECTED USER
 

    const user: User = {
        ws,
        userId,
        rooms: [],
    };

    users.push(user);

    console.log(
        "WebSocket connected:",
        userId
    );

  
    // CONNECTION SUCCESS
 

    ws.send(
        JSON.stringify({
            type: "connected",
            message: "WebSocket connected successfully",
        })
    );


     //HANDLE MESSAGES
    

    ws.on("message", async (data) => {

        try {

            const parsedData = JSON.parse(
                data.toString()
            );

            if (
                !parsedData ||
                typeof parsedData !== "object" ||
                Array.isArray(parsedData)
            ) {
                sendError(ws, "Invalid message");
                return;
            }

             //JOIN ROOM


            if (parsedData.type === "join_room") {

                const roomId = Number(
                    parsedData.roomId
                );

                // Validate roomId
                if (
                    !Number.isInteger(roomId) ||
                    roomId <= 0
                ) {

                    sendError(
                        ws,
                        "Invalid roomId"
                    );

                    return;
                }

                // Check room exists
                const room =
                    await prisma.room.findUnique({
                        where: {
                            id: roomId,
                        },
                    });

                if (!room) {

                    sendError(
                        ws,
                        "Room does not exist"
                    );

                    return;
                }

                // Prevent duplicate membership.
                const alreadyJoined =
                    user.rooms.includes(roomId);

                if (!alreadyJoined) {
                    user.rooms.push(roomId);
                }

                /*
                 * Initialize a room only once.
                 *
                 * The first client may provide its existing local
                 * elements. Later clients must receive the current
                 * shared scene instead of replacing it.
                 */

                if (!roomCanvases.has(roomId)) {
                    const initialElements =
                        Array.isArray(parsedData.elements) &&
                        parsedData.elements.length <=
                            MAX_CANVAS_ELEMENTS
                            ? parsedData.elements
                            : [];

                    roomCanvases.set(
                        roomId,
                        initialElements
                    );
                }

                // Tell client that room was joined
                ws.send(
                    JSON.stringify({
                        type: "joined_room",
                        roomId,
                    })
                );

                // Send the existing shared canvas to this client.
                ws.send(
                    JSON.stringify({
                        type: "canvas_state",
                        roomId,
                        elements:
                        roomCanvases.get(roomId) ?? [],
                    })
                );

                // Notify room members about the participant count.
                if (!alreadyJoined) {
                    broadcastRoomPresence(roomId);
                }

                console.log(
                    `User ${userId} joined room ${roomId}`
                );

                return;
            }


             // LEAVE ROOM

        
            if (parsedData.type === "leave_room") {

                const roomId = Number(
                    parsedData.roomId
                );

                // Validate roomId
                if (
                    !Number.isInteger(roomId) ||
                    roomId <= 0
                ) {

                    sendError(
                        ws,
                        "Invalid roomId"
                    );

                    return;
                }

                const wasJoined =
                    user.rooms.includes(roomId);

                // Remove room from user's rooms
                user.rooms = user.rooms.filter(
                    (id) => id !== roomId
                );

                // Tell client
                ws.send(
                    JSON.stringify({
                        type: "left_room",
                        roomId,
                    })
                );

                if (wasJoined) {
                    broadcastRoomPresence(roomId);
                }

                console.log(
                    `User ${userId} left room ${roomId}`
                );

                return;
            }

            
            
            // LIVE CANVAS SYNCHRONIZATION
       
            //  The frontend sends a canvas_update whenever the local
            //  scene changes. We store the latest scene and broadcast
            //  it to other users in the same room.
            
            

                if (parsedData.type === "canvas_update") {
                const roomId = Number(
                    parsedData.roomId
                );

                if (
                    !Number.isInteger(roomId) ||
                    roomId <= 0
                ) {
                    sendError(ws, "Invalid roomId");
                    return;
                }

                // Only room members can update its canvas.
                if (!user.rooms.includes(roomId)) {
                    sendError(
                        ws,
                        "You have not joined this room"
                    );
                    return;
                }

                const elements = parsedData.elements;

                if (
                    !Array.isArray(elements) ||
                    elements.length > MAX_CANVAS_ELEMENTS
                ) {
                    sendError(
                        ws,
                        "Invalid canvas elements"
                    );
                    return;
                }

                // Bound the serialized scene size.
                const serializedElements =
                    JSON.stringify(elements);

                if (
                    serializedElements.length >
                    MAX_CANVAS_SIZE
                ) {
                    sendError(
                        ws,
                        "Canvas snapshot is too large"
                    );
                    return;
                }

                // Keep the latest version of the room's canvas.
                roomCanvases.set(roomId, elements);

                // Broadcast to everyone else, but not the sender.
                // The joining client and other clients use canvas_state.
                broadcastToRoom(
                    roomId,
                    {
                        type: "canvas_state",
                        roomId,
                        elements,
                        updatedBy: userId,
                    },
                    ws
                );

                return;
            }



        // CHAT
      

            if (parsedData.type === "chat") {

                const roomId = Number(
                    parsedData.roomId
                );

                const message =
                    typeof parsedData.message === "string"
                        ? parsedData.message.trim()
                        : "";

                
                // Validate roomId
                

                if (
                    !Number.isInteger(roomId) ||
                    roomId <= 0
                ) {

                    sendError(
                        ws,
                        "Invalid roomId"
                    );

                    return;
                }

          
                // Validate message
             
                if (!message) {

                    sendError(
                        ws,
                        "Message cannot be empty"
                    );

                    return;
                }

          
                // Check user joined room
            

                if (!user.rooms.includes(roomId)) {

                    sendError(
                        ws,
                        "You have not joined this room"
                    );

                    return;
                }

              
                // Check room exists
   

                const room =
                    await prisma.room.findUnique({
                        where: {
                            id: roomId,
                        },
                    });

                if (!room) {

                    sendError(
                        ws,
                        "Room does not exist"
                    );

                    return;
                }

           
                // SAVE CHAT TO DATABASE
          

                const chat =
                    await prisma.chat.create({
                        data: {
                            roomId,
                            message,
                            userId,
                        },
                    });

          
                // BROADCAST MESSAG
          
                broadcastToRoom(roomId, {
                    type: "chat",
                    id: chat.id,
                    roomId,
                    message: chat.message,
                    userId: chat.userId,
                });

                return;
            }

              //UNKNOWN MESSAGE
   

            sendError(
                ws,
                "Unknown message type"
            );

        } catch (error) {

            console.error(
                "WebSocket message error:",
                error
            );

            sendError(
                ws,
                "Invalid WebSocket message"
            );
        }
    });

  
    // DISCONNECT
 

    ws.on("close", () => {

        // Remember the rooms so their participant counts can be updated.
        const joinedRooms = [...user.rooms];

        const index = users.findIndex(
            (connectedUser) =>
            connectedUser.ws === ws
        );

        if (index !== -1) {
            users.splice(index, 1);
        }

        for (const roomId of joinedRooms) {
            broadcastRoomPresence(roomId);
        }

        console.log(
            "WebSocket disconnected:",
            userId
        );
    });

   
    // SOCKET ERROR
   

    ws.on("error", (error) => {

        console.error(
            "WebSocket error:",
            error
        );
    });
});

console.log(
    "WebSocket server running on port 8080"
);

// import { WebSocket, WebSocketServer } from 'ws';
// import jwt, { JwtPayload } from "jsonwebtoken"
// import { JWT_SECRET } from '@repo/backend-common/config';
// import { prisma } from '@repo/db/client'
// const wss = new WebSocketServer({ port: 8080 });

// interface User {
//     ws: WebSocket,
//     rooms: string[],
//     userId: string
// }

// const users: User[] = []

// const checkUser = function (token: string): string | null {
//     try {
//         const decoded = jwt.verify(token, JWT_SECRET)


//         if (typeof decoded == "string") {

//             return null
//         }

//         if (!decoded || !decoded.userId) {

//             return null
//         }
//         return decoded.userId
//     }
//     catch(e){
//         return null
//     }
    
// }

// wss.on('connection',  function connection(ws, request) {
//     const url = request.url
//     if (!url) {
//         return
//     }

//     const queryParams = new URLSearchParams(url.split('?')[1])
//     const token = queryParams.get('token') || ""
//     const userId = checkUser(token)

//     if (!userId) {
//         ws.close()
//         return null
//     }

//     users.push({
//         ws,
//         userId,
//         rooms: []
//     })
//     ws.on('message', async function message(data) {
//         const parsedData = JSON.parse(data as unknown as string)

//         if (parsedData.type === "join_room") {
//             const user = users.find(x => x.ws === ws)
//             user?.rooms.push(parsedData.roomId)
//         }
//         if (parsedData.type === "leave_room") {
//             const user = users.find(x => x.ws === ws)
//             if (!user) {
//                 return
//             }
//             user.rooms = user?.rooms.filter(x => x === parsedData.room)
//         }

//         if (parsedData.type === "chat") {
//             const roomId = parsedData.roomId
//             const message = parsedData.message

//            await prisma.chat.create({
//                 data:{
//                     roomId,
//                     message,
//                     userId
//                 }
//             })
            

//             users.forEach(user => {
//                 if (user.rooms.includes(roomId)) {
//                     user.ws.send(JSON.stringify({
//                         type: "chat",
//                         message: message,
//                         roomId
//                     }))
//                 }
//             })
//         }
//     });
// });