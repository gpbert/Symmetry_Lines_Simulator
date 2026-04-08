import socketserver
import os
import sys

port = int(os.environ.get('PORT', 8000))
directory = '/Users/a.graham/Documents/Symmetry_Line_Simulator'

os.chdir(directory)

import http.server
handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(('', port), handler) as httpd:
    print(f"Serving on port {port}")
    sys.stdout.flush()
    httpd.serve_forever()
