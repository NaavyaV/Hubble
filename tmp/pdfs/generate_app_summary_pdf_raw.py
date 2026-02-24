from pathlib import Path

out_path = Path('output/pdf/hubble_app_one_page_summary.pdf')
out_path.parent.mkdir(parents=True, exist_ok=True)

lines = [
    ('title', 'Hubble App Summary'),
    ('meta', 'Evidence source: repository code and config files only'),
    ('space', ''),
    ('h', 'What It Is'),
    ('b', 'Hubble is an Expo/React Native mobile app for college communities that combines'),
    ('b', 'event planning with social networking. The codebase supports creating and discovering'),
    ('b', 'events, managing attendance, and interacting with friends and organizations.'),
    ('space', ''),
    ('h', 'Who It Is For'),
    ('b', 'Primary persona: college students using school-linked accounts to connect with peers'),
    ('b', 'through events and friend activity.'),
    ('space', ''),
    ('h', 'What It Does'),
    ('bullet', 'Onboards users with college selection and school email-domain validation.'),
    ('bullet', 'Lets users create, edit, and join events with privacy modes and invitations.'),
    ('bullet', 'Provides friend requests, accepted/pending states, muting/blocking, and reporting.'),
    ('bullet', 'Supports organization mode with org events, followers, and org settings.'),
    ('bullet', 'Handles push notifications with preferences, token storage, and queue processing.'),
    ('bullet', 'Includes photo galleries, uploads, and photo visibility controls.'),
    ('bullet', 'Offers profile management, account recovery/verification, and a leaderboard.'),
    ('space', ''),
    ('h', 'How It Works (Architecture)'),
    ('bullet', 'App shell: App.tsx defines stack/tab navigation and wraps ThemeProvider + OrgModeProvider.'),
    ('bullet', 'Feature UI: src/screens/* implements auth, onboarding, events, social, photos, org, settings.'),
    ('bullet', 'Backend: src/services/supabase.ts configures Supabase auth/session with AsyncStorage.'),
    ('bullet', 'Notifications: src/services/notifications.ts integrates Expo notifications and queue tables.'),
    ('bullet', 'Data flow: UI actions -> Supabase auth/DB/storage -> realtime subscriptions -> UI refresh/routing.'),
    ('space', ''),
    ('h', 'How To Run (Minimal)'),
    ('bullet', '1) npm install'),
    ('bullet', '2) Create .env with EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, APP_ENV'),
    ('bullet', '3) npm run start (dev client)'),
    ('bullet', '4) npm run ios or npm run android'),
    ('bullet', '5) Backend bootstrap/migration steps: Not found in repo.'),
]

# PDF helpers

def esc(text: str) -> str:
    return text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')

content = []
content.append('BT')
content.append('/F1 17 Tf')
content.append('40 760 Td')
content.append(f'({esc(lines[0][1])}) Tj')
content.append('ET')

y = 744
for kind, text in lines[1:]:
    if kind == 'space':
        y -= 8
        continue
    if kind == 'meta':
        size = 9
        x = 40
    elif kind == 'h':
        size = 11
        x = 40
    elif kind == 'b':
        size = 9
        x = 40
    else:
        size = 8.6
        x = 50
        text = f'- {text}'

    content.append('BT')
    content.append(f'/F1 {size} Tf')
    content.append(f'{x} {y} Td')
    content.append(f'({esc(text)}) Tj')
    content.append('ET')

    if kind == 'meta':
        y -= 12
    elif kind == 'h':
        y -= 12
    elif kind == 'b':
        y -= 11
    else:
        y -= 10

# footer
content.append('BT')
content.append('/F1 8 Tf')
content.append('520 18 Td')
content.append('(Page 1 of 1) Tj')
content.append('ET')

stream_data = '\n'.join(content).encode('latin-1')

objects = []

# 1 catalog
objects.append(b'1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
# 2 pages
objects.append(b'2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
# 3 page
objects.append(b'3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n')
# 4 font
objects.append(b'4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n')
# 5 contents
objects.append(f'5 0 obj\n<< /Length {len(stream_data)} >>\nstream\n'.encode('latin-1') + stream_data + b'\nendstream\nendobj\n')

pdf = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
offsets = [0]
for obj in objects:
    offsets.append(len(pdf))
    pdf.extend(obj)

xref_pos = len(pdf)
pdf.extend(f'xref\n0 {len(objects)+1}\n'.encode('latin-1'))
pdf.extend(b'0000000000 65535 f \n')
for off in offsets[1:]:
    pdf.extend(f'{off:010d} 00000 n \n'.encode('latin-1'))

pdf.extend(
    f'trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n'.encode('latin-1')
)

out_path.write_bytes(pdf)
print(str(out_path))
