from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem

output_path = "output/pdf/hubble_app_one_page_summary.pdf"

doc = SimpleDocTemplate(
    output_path,
    pagesize=letter,
    leftMargin=40,
    rightMargin=40,
    topMargin=34,
    bottomMargin=34,
)

styles = {
    "title": ParagraphStyle(
        "title",
        fontName="Helvetica-Bold",
        fontSize=17,
        leading=20,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=4,
    ),
    "subtitle": ParagraphStyle(
        "subtitle",
        fontName="Helvetica",
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#475569"),
        spaceAfter=8,
    ),
    "h2": ParagraphStyle(
        "h2",
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=13,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=4,
        spaceAfter=3,
    ),
    "body": ParagraphStyle(
        "body",
        fontName="Helvetica",
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#111827"),
        spaceAfter=2,
    ),
    "bullet": ParagraphStyle(
        "bullet",
        fontName="Helvetica",
        fontSize=8.8,
        leading=10.8,
        textColor=colors.HexColor("#111827"),
        leftIndent=0,
    ),
}

story = []
story.append(Paragraph("Hubble App Summary", styles["title"]))
story.append(Paragraph("Evidence source: repository code and configuration files only", styles["subtitle"]))

story.append(Paragraph("What It Is", styles["h2"]))
story.append(
    Paragraph(
        "Hubble is an Expo/React Native mobile app for college communities that combines event planning with social networking. "
        "The codebase supports creating and discovering events, managing attendance, and interacting with friends and organizations.",
        styles["body"],
    )
)

story.append(Paragraph("Who It Is For", styles["h2"]))
story.append(
    Paragraph(
        "Primary persona: college students using a school-linked account to connect with peers through events and friend activity.",
        styles["body"],
    )
)

story.append(Paragraph("What It Does", styles["h2"]))
feature_bullets = [
    "Onboards users with college selection and school email-domain validation before account completion.",
    "Lets users create, edit, and join events with privacy modes, invitations, attendee status, and event detail views.",
    "Provides social graph features: friend requests, accepted/pending states, blocking/muting, and reporting flows.",
    "Supports organization mode with org event feeds, follower management, and organization settings/editing screens.",
    "Handles push notifications with per-category preferences, token management, and queued notification processing.",
    "Includes event and general photo galleries plus upload and privacy controls for shared images.",
    "Offers profile management, account verification/reset flows, and a leaderboard screen.",
]

story.append(
    ListFlowable(
        [ListItem(Paragraph(item, styles["bullet"])) for item in feature_bullets],
        bulletType="bullet",
        bulletFontName="Helvetica",
        bulletFontSize=7,
        leftIndent=10,
        bulletOffsetY=0,
        spaceBefore=0,
        spaceAfter=3,
    )
)

story.append(Paragraph("How It Works (Architecture)", styles["h2"]))
architecture_bullets = [
    "App shell: `App.tsx` defines stack and tab navigation and wraps the app with `ThemeProvider` and `OrgModeProvider`.",
    "Feature UI: screen modules under `src/screens/` implement auth, onboarding, events, social, photos, settings, legal, and org workflows.",
    "Backend access: `src/services/supabase.ts` creates a Supabase client (auth/session persistence in AsyncStorage, network-aware fetch wrapper).",
    "Notifications: `src/services/notifications.ts` manages Expo permission/token setup, writes `notification_tokens`/`notification_queue`, and can trigger `functions/v1/process-notifications`.",
    "Data flow: UI actions call Supabase auth/DB/storage APIs; realtime subscriptions in `App.tsx` refresh badges and event/invitation state; notification taps route users to relevant event/social screens.",
]

story.append(
    ListFlowable(
        [ListItem(Paragraph(item, styles["bullet"])) for item in architecture_bullets],
        bulletType="bullet",
        bulletFontName="Helvetica",
        bulletFontSize=7,
        leftIndent=10,
        bulletOffsetY=0,
        spaceBefore=0,
        spaceAfter=3,
    )
)

story.append(Paragraph("How To Run (Minimal)", styles["h2"]))
run_bullets = [
    "Install dependencies: `npm install`.",
    "Create `.env` with `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `APP_ENV` (used by app config).",
    "Start dev client: `npm run start`.",
    "Run on device/simulator as needed: `npm run ios` or `npm run android`.",
    "Backend bootstrap/migration steps: Not found in repo.",
]

story.append(
    ListFlowable(
        [ListItem(Paragraph(item, styles["bullet"])) for item in run_bullets],
        bulletType="bullet",
        bulletFontName="Helvetica",
        bulletFontSize=7,
        leftIndent=10,
        bulletOffsetY=0,
        spaceBefore=0,
        spaceAfter=0,
    )
)


def draw_header_footer(canvas, doc_obj):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#64748b"))
    canvas.drawRightString(doc_obj.pagesize[0] - 40, 18, "Page 1 of 1")
    canvas.restoreState()


doc.build(story, onFirstPage=draw_header_footer)
print(output_path)
