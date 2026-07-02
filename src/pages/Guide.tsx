import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Link } from "react-router-dom";
import {
  LayoutDashboard, Radar, Globe2, Briefcase, Building2, Mail, BarChart3,
  GraduationCap, PlayCircle, HelpCircle, Rocket, CheckCircle2, ArrowRight,
} from "lucide-react";

type Step = { title: string; body: string };
type Section = {
  id: string;
  icon: any;
  title: string;
  to?: string;
  oneLiner: string;
  when: string;
  steps: Step[];
  tips?: string[];
};

const sections: Section[] = [
  {
    id: "dashboard",
    icon: LayoutDashboard,
    title: "1. Dashboard — Roz subah yahin se start karo",
    to: "/",
    oneLiner: "Pura overview: kitne leads mile, kitne mail gaye, kitne pending, kitne WhatsApp gaye.",
    when: "Har din login karte hi sabse pehle yahaan aao — 30 second me pata chal jayega aaj ka status kya hai.",
    steps: [
      { title: "Numbers padho", body: "Top pe cards dikhte hain: Total leads, Emails sent, Pending, WhatsApp sent. Yahin se andaza laga lo aaj kitna kaam bacha hai." },
      { title: "Kuch bhi red/orange dikhe toh click karo", body: "Agar 'Pending' ya 'Blocked' number bada dikhe, us card pe click karke direct Mail page pe jao aur fix karo." },
    ],
  },
  {
    id: "demand",
    icon: Radar,
    title: "2. Demand Intelligence — Naye employers dhundhne ke liye",
    to: "/demand",
    oneLiner: "Ye Europe me jo companies workers hire karna chahti hain unki list banata hai (automatic scraping).",
    when: "Jab naye leads chahiye — ya jab existing list purani lagne lage.",
    steps: [
      { title: "List dekho", body: "Table me har row ek employer/company hai jo hiring kar rahi hai. Country, city, role, aur contact info dikhega." },
      { title: "Filter lagao", body: "Upar country ya trade select karke apne target market ke leads dekh sakte ho (Serbia, Greece, etc.)." },
      { title: "Kisi lead pe click karo", body: "Detail page khulega — waha se seedha 'Send email' ya 'Send WhatsApp' bhi kar sakte ho." },
    ],
    tips: ["Agar list chhoti lage, Discovery Runs page se naya run trigger kar do."],
  },
  {
    id: "local-hiring",
    icon: Globe2,
    title: "3. Local Hiring — Country-wise leads + Export",
    to: "/local-hiring",
    oneLiner: "Country ke hisab se leads dekhne aur Excel/PDF me download karne ki jagah.",
    when: "Jab kisi specific country ka data manager ko bhejna ho, ya offline review karna ho.",
    steps: [
      { title: "Country choose karo", body: "Upar se country tab select karo." },
      { title: "Enrich Emails card", body: "Ye button dabaao — ye scraping se emails dhundhega. Ek time me 8-10 leads process hote hain, dubara dabao aur batches me chalao." },
      { title: "Export Excel / Export PDF", body: "Right side ke buttons se poori list download ho jayegi — sharing ke liye." },
    ],
  },
  {
    id: "leads",
    icon: Briefcase,
    title: "4. Leads — Har ek company/contact ki detail",
    to: "/leads",
    oneLiner: "Sabhi discovered contacts ki central list. Search, filter, aur individual actions yahin hote hain.",
    when: "Jab kisi specific person ko manually mail/WhatsApp bhejna ho ya notes daalne ho.",
    steps: [
      { title: "Search karo", body: "Upar search box me name/company likho — ya '/' dabao keyboard se turant focus ho jayega." },
      { title: "Row pe click karo", body: "Detail page khulega. Waha 'Send email now' aur 'Send WhatsApp' buttons directly dabaakar personalised message bhej sakte ho." },
      { title: "Notes add karo", body: "Detail page pe notes section me apna follow-up likh do — team ko dikhega." },
    ],
  },
  {
    id: "recruiters",
    icon: Building2,
    title: "5. Recruiters — Agency contacts",
    to: "/recruiters",
    oneLiner: "Alag list sirf recruitment agencies ki (jo aage employers ko connect karti hain).",
    when: "Jab B2B recruiter partnership banani ho.",
    steps: [
      { title: "List browse karo", body: "Country/specialty filter lagakar relevant agencies dhundo." },
      { title: "Campaign me add karo", body: "Campaign page se 'Recruiters' audience choose karke bulk mail bhej sakte ho." },
    ],
  },
  {
    id: "mail",
    icon: Mail,
    title: "6. Mail / Outreach — Sabse important page",
    to: "/mail",
    oneLiner: "Yahaan se emails aur WhatsApp automatic send hote hain — daily 200 mail cap ke sath.",
    when: "Har din 1-2 baar check karo. Naye leads queue me daalne ke liye aur pending mail flush karne ke liye.",
    steps: [
      { title: "Walkthrough dekh lo", body: "Pehli baar aao toh 60-second guided tour chalega — usse pura layout samajh aa jayega." },
      { title: "Demand emails tab", body: "'Queue new leads' dabao → naye contacts add ho jayenge. 'Process queue now' dabao → pending mail turant send hone lagenge (3 min gap ke saath)." },
      { title: "WhatsApp tab", body: "50 numbers/day tak dikhega. Har row pe green 'Send' button — click karo, WhatsApp Web khulega pre-filled message ke saath, bas Enter dabao." },
      { title: "Stuck? bar", body: "Agar mail atak jayein — 'Retry failed' ya 'Clear today queue' dabao, sab reset ho jayega." },
    ],
    tips: [
      "Status panel expand karke dekho — batayega kyun mail nahi ja rahe (rate limit, missing email, etc.)",
      "Har mail me 3 minute ka gap hota hai — ye Resend ke rate-limit ke liye zaroori hai, mat ghabrao.",
    ],
  },
  {
    id: "campaign",
    icon: BarChart3,
    title: "7. Campaign — Bulk multi-channel outreach",
    to: "/campaign",
    oneLiner: "Ek saath 50/100/200 mail-per-day ke schedule pe campaign chalane ke liye. Email, WhatsApp ya LinkedIn — teeno channels.",
    when: "Jab planned drip campaign chahiye ho (e.g. har din 50 blue-collar + 50 OTHM).",
    steps: [
      { title: "Create campaign", body: "Top-right button dabao. Naam do." },
      { title: "Audience choose karo", body: "3 tabs: Recruiters, Employers (demand), OTHM. Filter lagao (country, quality)." },
      { title: "Channel choose karo", body: "Email = fully automatic. WhatsApp/LinkedIn = manual queue banega tere liye." },
      { title: "Template likho", body: "Subject aur body me merge tags use karo: {{contact_name}}, {{employer_name}}, {{country}} etc. OTHM ke liye alag tags hain — page pe list dikhegi." },
      { title: "Schedule + Launch", body: "Daily limit set karo (50 recommended), start date choose karo, Launch dabao. Baaki automatic." },
    ],
    tips: ["Parallel me kai campaigns chala sakte ho — har audience ke liye alag. Total 150-200/day tak safe hai."],
  },
  {
    id: "othm",
    icon: GraduationCap,
    title: "8. OTHM Students — UK certificate leads",
    to: "/othm",
    oneLiner: "Alag section OTHM certificate wale students/colleges ke liye (L3–L7 courses).",
    when: "Jab OTHM-specific campaign chalana ho.",
    steps: [
      { title: "CSV/Excel import", body: "Upar 'Import' button se sheet upload karo — columns auto-map ho jayenge (name, email, institution, level, etc.)." },
      { title: "Stage track karo", body: "Har lead ka status update karte raho: New → Contacted → Interested → Enrolled." },
      { title: "Campaign se link karo", body: "Campaign page pe 'OTHM' audience select karke inhe drip mail bhej sakte ho." },
    ],
  },
  {
    id: "candidates",
    icon: HelpCircle,
    title: "9. Candidates — Workers ka database",
    to: "/candidates",
    oneLiner: "Jo blue-collar workers apply karte hain unki profile list.",
    when: "Employer se match karne ke liye ya profile share karne ke liye.",
    steps: [
      { title: "Profile khoolo", body: "Naam pe click karke pura CV, documents, visa status dekh sakte ho." },
      { title: "Document expiry dekho", body: "60 din pehle alert automatic aata hai — us se pehle renew karwa lo." },
    ],
  },
  {
    id: "runs",
    icon: PlayCircle,
    title: "10. Discovery Runs — Scraping ka control room",
    to: "/runs",
    oneLiner: "Yahaan se scrapers trigger hote hain jo naye leads laate hain.",
    when: "Jab lead list purani lag rahi ho ya kisi naye country ke liye data chahiye.",
    steps: [
      { title: "Naya run trigger karo", body: "Top pe 'Start run' dabao, country/keyword choose karo." },
      { title: "Progress dekho", body: "Table me har row ek run — status: running / done / failed. Failed pe click karke reason padh sakte ho." },
      { title: "Result", body: "Run complete hote hi naye leads Demand Intelligence + Leads page pe automatic aa jayenge." },
    ],
  },
];

const dailyRoutine = [
  { time: "Subah (10 min)", action: "Dashboard → Mail page. Pending count dekho. 'Process queue now' dabao." },
  { time: "Din me (15 min)", action: "Leads/Demand page se 5-10 naye promising leads pe click karke personal notes/mail bhejo." },
  { time: "Shaam (5 min)", action: "Mail page pe status panel check karo. Kal ke liye 'Queue new leads' dabao." },
  { time: "Weekly", action: "Local Hiring se Excel export karke manager ko share karo. Discovery Runs se naya run chalao." },
];

export default function Guide() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Rocket className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">User Guide — Voynova Platform</h1>
        </div>
        <p className="text-muted-foreground">
          Pura app ka simple Hinglish walkthrough. Har page kya karta hai, kab use karna hai, aur step-by-step kaise chalana hai.
        </p>
      </div>

      <Card className="border-primary/40 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Daily Routine (bas itna karo roz)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {dailyRoutine.map((r) => (
            <div key={r.time} className="flex gap-3 text-sm">
              <Badge variant="secondary" className="shrink-0 min-w-[130px] justify-center">{r.time}</Badge>
              <span>{r.action}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Har page ka detailed guide</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <AccordionItem value={s.id} key={s.id}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3 text-left">
                      <Icon className="h-5 w-5 text-primary shrink-0" />
                      <div>
                        <div className="font-semibold">{s.title}</div>
                        <div className="text-xs text-muted-foreground font-normal mt-0.5">{s.oneLiner}</div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pl-8">
                    <div className="text-sm">
                      <span className="font-semibold text-foreground">Kab use karo: </span>
                      <span className="text-muted-foreground">{s.when}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-semibold">Steps:</div>
                      <ol className="space-y-2">
                        {s.steps.map((step, i) => (
                          <li key={i} className="flex gap-3 text-sm">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                              {i + 1}
                            </span>
                            <div>
                              <div className="font-medium">{step.title}</div>
                              <div className="text-muted-foreground">{step.body}</div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                    {s.tips && s.tips.length > 0 && (
                      <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 space-y-1">
                        <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">💡 Tips</div>
                        {s.tips.map((t, i) => (
                          <div key={i} className="text-xs text-muted-foreground">• {t}</div>
                        ))}
                      </div>
                    )}
                    {s.to && (
                      <Link
                        to={s.to}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        Open this page <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Common questions</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple">
            <AccordionItem value="q1">
              <AccordionTrigger className="text-sm">Mail send nahi ho rahe, kya karu?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-1">
                <p>1. Mail page kholo → "Email queue status" panel expand karo — reason likha hoga.</p>
                <p>2. "Stuck?" bar me "Retry failed" dabao.</p>
                <p>3. Fir bhi na chale toh Diagnostics page dekho (agar admin ho).</p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q2">
              <AccordionTrigger className="text-sm">Ek din me kitne mail ja sakte hain?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Max 200 emails/day per campaign, 50 WhatsApp/day. Har mail me 3 min gap. Sab automatic manage hota hai.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q3">
              <AccordionTrigger className="text-sm">Personalised mail kaise banta hai?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Template me merge tags dalne se — jaise {"{{contact_name}}"}, {"{{employer_name}}"}, {"{{country}}"}. Send hote waqt actual data fill ho jata hai.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q4">
              <AccordionTrigger className="text-sm">WhatsApp kaise bhejta hu?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Mail page → WhatsApp tab → row me green "Send" button dabao → WhatsApp Web pre-filled message ke saath khulega → bas Enter dabao.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q5">
              <AccordionTrigger className="text-sm">Excel/PDF download kaha se hoti hai?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Local Hiring page pe top-right "Export Excel" aur "Export PDF" buttons hain.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground py-4">
        Kuch samajh na aaye toh manager ko bolo — ya Mail page pe walkthrough dubara chalao.
      </p>
    </div>
  );
}