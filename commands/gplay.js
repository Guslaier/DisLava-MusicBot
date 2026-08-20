const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gplay',
        description: 'เล่นเพลงจาก YouTube หรือชื่อเพลง',
        options: [
            {
                name: 'query',
                type: 3, // STRING
                description: 'ชื่อเพลง หรือ ลิ้งก์ YouTube',
                required: true,
            },
            {
                name: 'top',
                type: 5, // BOOLEAN
                description: 'เล่นเพลงนี้เป็นคิวต่อไป (แซงคิว)',
                required: false,
            },
        ],
    },
    run: async (client, interaction, kazagumo) => {
        const voiceChannel = interaction.member?.voice?.channel;
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!voiceChannel) {
            embed.setDescription('❌ อ๊ะๆ! ตัวเธอต้องเข้าห้องเสียงก่อนนะคะ เดี๋ยวดีเจเหงาแย่เลย~ 🥺');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        let query = interaction.options.getString('query');
        const top = interaction.options.getBoolean('top');
        await interaction.deferReply();

        let player = kazagumo.players.get(interaction.guild.id);
        if (!player) {
            player = await kazagumo.createPlayer({
                guildId: interaction.guild.id,
                textId: interaction.channel.id,
                voiceId: voiceChannel.id,
                volume: 100
            });
        }

        if (query.includes('youtube.com') || query.includes('youtu.be')) {
            if (query.includes('list=')) {
                try {
                    const YouTube = require('youtube-sr').default;
                    const playlist = await YouTube.getPlaylist(query);
                    if (playlist && playlist.videos && playlist.videos.length > 0) {
                        const maxTracks = Math.min(playlist.videos.length, 30);
                        
                        embed.setDescription(`⏳ กำลังโหลดเพลงแรกจากเพลย์ลิสต์ **${playlist.title}**...`);
                        await interaction.followUp({ embeds: [embed] });

                        // ฟังก์ชันช่วยหาเพลงพร้อมลบคำขยะถ้าหาไม่เจอ
                        const searchTrack = async (title) => {
                            let res = await kazagumo.search(title, { engine: 'soundcloud', requester: interaction.user });
                            if (!res.tracks.length) {
                                const cleanTitle = title.replace(/\[.*?\]|\(.*?\)|【.*?】|MV|Official|Music Video|Audio|Lyrics/gi, '').replace(/\s+/g, ' ').trim();
                                if (cleanTitle && cleanTitle !== title) {
                                    res = await kazagumo.search(cleanTitle, { engine: 'soundcloud', requester: interaction.user });
                                }
                            }
                            return res;
                        };

                        const firstVideo = playlist.videos[0];
                        let firstSearchRes = await searchTrack(firstVideo.title);
                        
                        if (firstSearchRes.tracks.length) {
                            if (top && player.queue.length > 0) {
                                player.queue.unshift(firstSearchRes.tracks[0]);
                            } else {
                                player.queue.add(firstSearchRes.tracks[0]);
                            }
                            if (!player.playing && !player.paused) {
                                setTimeout(() => {
                                    if (player) player.play();
                                }, 1500);
                            }
                        }

                        embed.setDescription(`✅ นำเข้าเพลย์ลิสต์แล้ว!\n*(กำลังดึงเพลงที่เหลืออีก ${maxTracks - 1} เพลงลงคิวแบบชิวๆ เพื่อไม่ให้บอทกระตุกค่า 🎶)*`);
                        await interaction.editReply({ embeds: [embed] });

                        // ดึงเพลงที่เหลืออยู่เบื้องหลัง
                        (async () => {
                            for (let i = 1; i < maxTracks; i++) {
                                await new Promise(resolve => setTimeout(resolve, 1500)); 
                                const video = playlist.videos[i];
                                let searchRes = await searchTrack(video.title);
                                if (searchRes.tracks.length) {
                                    player.queue.add(searchRes.tracks[0]);
                                    // หากคิวก่อนหน้าเล่นจบหรือยังไม่ได้เริ่มเล่น ให้เริ่มเล่นทันที
                                    if (!player.playing && !player.paused) {
                                        player.play();
                                    }
                                }
                            }
                        })();
                        
                        return;
                    }
                } catch (e) {
                    console.log("youtube-sr failed, trying custom Mix parser...");
                    try {
                        const fetch = (await import('node-fetch')).default;
                        const res = await fetch(query, { headers: { "User-Agent": "Mozilla/5.0" } });
                        const text = await res.text();
                        const match = text.match(/ytInitialData\s*=\s*({.+?});/);
                        if (match) {
                            const data = JSON.parse(match[1]);
                            const playlistPanel = data.contents.twoColumnWatchNextResults.playlist.playlist;
                            const tracks = playlistPanel.contents.map(i => {
                                const video = i.playlistPanelVideoRenderer;
                                if(!video) return null;
                                return video.title.simpleText;
                            }).filter(Boolean);
                            
                            if (tracks.length > 0) {
                                const playlist = {
                                    title: playlistPanel.title || "YouTube Mix",
                                    videos: tracks.map(t => ({ title: t }))
                                };
                                const maxTracks = Math.min(playlist.videos.length, 30);
                                
                                embed.setDescription(`⏳ กำลังโหลดเพลงแรกจากเพลย์ลิสต์ **${playlist.title}**...`);
                                await interaction.followUp({ embeds: [embed] });

                                const searchTrack = async (title) => {
                                    let res = await kazagumo.search(title, { engine: 'soundcloud', requester: interaction.user });
                                    if (!res.tracks.length) {
                                        const cleanTitle = title.replace(/\[.*?\]|\(.*?\)|【.*?】|MV|Official|Music Video|Audio|Lyrics/gi, '').replace(/\s+/g, ' ').trim();
                                        if (cleanTitle && cleanTitle !== title) {
                                            res = await kazagumo.search(cleanTitle, { engine: 'soundcloud', requester: interaction.user });
                                        }
                                    }
                                    return res;
                                };

                                const firstVideo = playlist.videos[0];
                                let firstSearchRes = await searchTrack(firstVideo.title);
                                
                                if (firstSearchRes.tracks.length) {
                                    if (top && player.queue.length > 0) {
                                        player.queue.unshift(firstSearchRes.tracks[0]);
                                    } else {
                                        player.queue.add(firstSearchRes.tracks[0]);
                                    }
                                    if (!player.playing && !player.paused) {
                                        setTimeout(() => {
                                            if (player) player.play();
                                        }, 1500);
                                    }
                                }

                                embed.setDescription(`✅ นำเข้าเพลย์ลิสต์แล้ว!\n*(กำลังดึงเพลงที่เหลืออีก ${maxTracks - 1} เพลงลงคิวแบบชิวๆ เพื่อไม่ให้บอทกระตุกค่า 🎶)*`);
                                await interaction.editReply({ embeds: [embed] });

                                (async () => {
                                    for (let i = 1; i < maxTracks; i++) {
                                        await new Promise(resolve => setTimeout(resolve, 1500)); 
                                        const video = playlist.videos[i];
                                        let searchRes = await searchTrack(video.title);
                                        if (searchRes.tracks.length) {
                                            player.queue.add(searchRes.tracks[0]);
                                            if (!player.playing && !player.paused) {
                                                player.play();
                                            }
                                        }
                                    }
                                })();
                                return;
                            }
                        }
                    } catch (mixErr) {
                        console.error("Custom Mix parser failed:", mixErr);
                    }
                    console.error("YouTube Playlist Parse Error (Fallback to single video):", e);
                    // ปล่อยให้มันไหลไปหา oEmbed เพื่อเล่นแบบเพลงเดี่ยว
                }
            }

            try {
                const fetch = (await import('node-fetch')).default;
                const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(query)}&format=json`);
                if (response.ok) {
                    const data = await response.json();
                    query = data.title;
                } else {
                    console.log("oEmbed failed, falling back to native Kazagumo URL resolution");
                }
            } catch (e) {
                console.error("YouTube oEmbed Error:", e);
                console.log("oEmbed threw error, falling back to native Kazagumo URL resolution");
            }
        }

        let result = await kazagumo.search(query, {
            requester: interaction.user,
            engine: query.startsWith('http') ? undefined : 'soundcloud'
        });

        // หากหาใน SoundCloud ไม่เจอ ให้ลองลบวงเล็บหรือคำต่อท้ายออกแล้วหาใหม่
        if (!result.tracks.length && !query.startsWith('http')) {
            const cleanQuery = query.replace(/\[.*?\]|\(.*?\)|【.*?】|MV|Official|Music Video|Audio|Lyrics/gi, '').replace(/\s+/g, ' ').trim();
            if (cleanQuery && cleanQuery !== query) {
                result = await kazagumo.search(cleanQuery, {
                    requester: interaction.user,
                    engine: 'soundcloud'
                });
            }
        }

        if (!result.tracks.length) {
            embed.setDescription('❌ หาเพลงไม่เจอค่ะ! (ลองลบคำว่า Official/MV ออก หรือพิมพ์แค่ชื่อเพลงสั้นๆ ดูนะคะ) 😿');
            return interaction.followUp({ embeds: [embed] });
        }

        if (result.type === 'PLAYLIST') {
            for (const track of result.tracks) {
                player.queue.add(track);
            }
            embed.setDescription(`✅ จัดไปชุดใหญ่ไฟกระพริบ! เพิ่มเพลย์ลิสต์ **${result.playlistName}** (${result.tracks.length} เพลง) ลงในคิวแล้วค่ะ 💃✨`);
            await interaction.followUp({ embeds: [embed] });
        } else {
            const track = result.tracks[0];
            if (top && player.queue.length > 0) {
                player.queue.unshift(track);
            } else {
                player.queue.add(track);
            }
            embed.setDescription(`**${track.title}**\n\n${player.playing ? (top ? `⬆️ วีไอพีสุดๆ! แซงคิวเป็นเพลงต่อไปให้แล้วค่ะ 💅` : `✅ รับแซ่บค่ะ! ดีเจสาวจับยัดลงคิวให้แล้วนะคะ เตรียมตัวโยกได้เลย 📝💋`) : `▶️ ดีเจจัดให้! เริ่มเล่นเพลงแล้วค่ะ 🎧✨`}`);
            await interaction.followUp({ embeds: [embed] });
        }

        if (!player.playing && !player.paused) {
            setTimeout(() => {
                if (player) player.play();
            }, 1500);
        }
    }
};
