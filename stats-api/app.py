from flask import Flask, jsonify, request
from nba_api.stats.endpoints import playergamelog, commonallplayers
from nba_api.stats.library.parameters import SeasonAll
import pandas as pd

app = Flask(__name__)

# Cache player list to avoid repeated calls
_player_cache = None

def get_all_players():
    global _player_cache
    if _player_cache is None:
        result = commonallplayers.CommonAllPlayers(is_only_current_season=0)
        _player_cache = result.get_data_frames()[0]
    return _player_cache

def find_player_id(name):
    players = get_all_players()
    name_lower = name.lower()
    match = players[players['DISPLAY_FIRST_LAST'].str.lower() == name_lower]
    if match.empty:
        # Try partial match
        match = players[players['DISPLAY_FIRST_LAST'].str.lower().str.contains(name_lower)]
    if match.empty:
        return None
    return str(match.iloc[0]['PERSON_ID'])

def get_recent_stats(player_id, games=10):
    # Try playoffs first
    for season_type in ['Playoffs', 'Regular Season']:
        try:
            log = playergamelog.PlayerGameLog(
                player_id=player_id,
                season='2024-25',
                season_type_all_star=season_type
            )
            df = log.get_data_frames()[0]
            if not df.empty:
                df = df.head(games)
                return {
                    'pts': round(df['PTS'].mean(), 1),
                    'ast': round(df['AST'].mean(), 1),
                    'reb': round(df['REB'].mean(), 1),
                    'games': len(df),
                    'source': season_type
                }
        except Exception:
            continue
    return None

@app.route('/stats')
def stats():
    name = request.args.get('player')
    games = int(request.args.get('games', 10))

    if not name:
        return jsonify({'error': 'player param required'}), 400

    player_id = find_player_id(name)
    if not player_id:
        return jsonify({'error': f'Player not found: {name}'}), 404

    averages = get_recent_stats(player_id, games)
    if not averages:
        return jsonify({'error': f'No stats found for {name}'}), 404

    return jsonify({'player': name, **averages})

@app.route('/health')
def health():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5001)))