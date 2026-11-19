'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

const INITIAL_FORM = {
  fullName: '',
  dateOfBirth: '',
  placeOfBirth: '',
  gender: '',
  phone: '',
  citizenId: '',
  hasIdentityCard: '',
  hasDrivingLicense: '',
  ticketHistory: '',
  ticketDetails: '',
  detainedHistory: '',
  detainedDetails: '',
  arrestedHistory: '',
  arrestedDetails: '',
  ridealongHistory: '',
  ridealongDetails: '',
  reasonToApply: '',
  reasonToAccept: '',
  leoCivilianDifference: '',
  realName: '',
  realAge: '',
  location: '',
  discordId: '',
  previousLeoExperience: '',
  previousLeoDetails: '',
};

const CONTROL_CLASS = 'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-emerald-500';
const PLACEHOLDER = 'Answer Here';

function wordCount(value) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function formattedDate(value) {
  const displayDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || '');
  if (displayDate) return value;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return PLACEHOLDER;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function yesWithDetails(answer, details) {
  if (!answer) return PLACEHOLDER;
  if (answer.toUpperCase() !== 'YES') return 'No';
  const reason = details.trim();
  return `Yes, ${reason || PLACEHOLDER}`;
}

function splitName(fullName) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const midpoint = Math.ceil(words.length / 2);
  return {
    firstName: words.slice(0, midpoint).join(' '),
    lastName: words.slice(midpoint).join(' '),
  };
}

function buildBbcode(form) {
  const { firstName, lastName } = splitName(form.fullName);
  const formattedFirstName = firstName || PLACEHOLDER;
  const formattedLastName = lastName || PLACEHOLDER;
  const value = (text) => text.trim() || PLACEHOLDER;

  return `[divbox=white][center][img]https://imagizer.imageshack.com/v2/200x200q70/924/Rs1Hi8.png[/img][img]https://imagizer.imageshack.com/img924/9329/WjRSSl.png[/img][img]https://imageshack.com/i/pogQ42LOp[/img]

[size=150]LAW ENFORCEMENT OFFICER RECRUITMENT[/size][/center]

[size=120]INSTRUCTIONS FOR THE APPLICANT[/size]
[list][*]Answer the question with proper English or Bahasa.
[*]Replace each "Answer Here" with your answer.
[*]Make sure all answers are complete before submitting.
[*][b](([/b] Any attempt to use false, misleading, or stolen identity information is a serious violation of our rules and may result in immediate suspension or permanent ban from this platform. Always provide accurate and truthful information. [b]))[/b]
[*][b](([/b] Your title should be [b][Police Officer Recruitment] Firstname Lastname[/b] of your character. [b]))[/b][/list]
[center][b]MAKE SURE THAT YOU READ THE RECRUITMENTS BEFORE APPLY[/b][/center][/divbox]
[divbox=black][size=120][color=white]PERSONAL INFORMATION[/color][/size][/divbox]
[divbox=white][list=1][*]RECRUITEE NAME [b]:[/b]
[list=none][*]First Name[b]:[/b] ${formattedFirstName}
[*]Last Name[b]:[/b] ${formattedLastName}[/list]
[*]Date of Birth (DD/MM/YYYY) [b]:[/b]
[list=none][*]${formattedDate(form.dateOfBirth)}[/list]
[*]Place of Birth [b]:[/b]
[list=none][*]${value(form.placeOfBirth)}[/list]
[*]Gender [b]:[/b]
[list=none][*]${value(form.gender)}[/list]
[*]Phone Number [b]:[/b]
[list=none][*]${value(form.phone)}[/list]
[*]Citizen ID [b]:[/b]
[list=none][*]${value(form.citizenId)}[/list][/list][/divbox]
[divbox=black][size=120][color=white]LEGAL INFORMATION[/color][/size][/divbox]
[divbox=white][list=1][*]DO YOU HAVE AN IDENTIFICATION CARD (ID/KTP)? [b]:[/b]
[list=none][*]${value(form.hasIdentityCard)}[/list]
[*]DO YOU HAVE A DRIVING LICENSE? [b]:[/b]
[list=none][*]${value(form.hasDrivingLicense)}[/list]
[*]HAVE YOU EVER RECEIVED A TICKET FROM LEO? IF YES, PLEASE EXPLAIN. [b]:[/b]
[list=none][*]${yesWithDetails(form.ticketHistory, form.ticketDetails)}[/list]
[*]HAVE YOU EVER BEEN DETAINED BY LEO? IF YES, PLEASE EXPLAIN. [b]:[/b]
[list=none][*]${yesWithDetails(form.detainedHistory, form.detainedDetails)}[/list]
[*]HAVE YOU EVER BEEN ARRESTED BY LEO? IF YES, PLEASE EXPLAIN. [b]:[/b]
[list=none][*]${yesWithDetails(form.arrestedHistory, form.arrestedDetails)}[/list]
[*]HAVE YOU JOINED ANY RIDEALONG PROGRAM? IF YES, WHO WERE THE OFFICERS? [b]:[/b]
[list=none][*]${yesWithDetails(form.ridealongHistory, form.ridealongDetails)}[/list][/list][/divbox]
[divbox=black][size=120][color=white]PERSONAL QUESTION[/color][/size][/divbox]
[divbox=white][list=1][*]WHY DO YOU WANT TO APPLY AS A POLICE OFFICER? [b](At least 100 words):[/b]
[list=none][*]${value(form.reasonToApply)}[/list]
[*]WHY SHOULD WE ACCEPT YOU AS A POLICE OFFICER? [b](At least 100 words):[/b]
[list=none][*]${value(form.reasonToAccept)}[/list]
[*]WHAT IS THE DIFFERENCE BETWEEN LEO AND CIVILIAN SOCIETY GROUP? [b]:[/b]
[list=none][*]${value(form.leoCivilianDifference)}[/list][/list][/divbox]
[divbox=black][size=120][color=white]OUT OF CHARACTER INFORMATION[/color][/size][/divbox]
[divbox=white][list=1][*]Real Life Name [b]:[/b]
[list=none][*]${value(form.realName)}[/list]
[*]Real Life Age [b]:[/b]
[list=none][*]${value(form.realAge)}[/list]
[*]Location [b]:[/b]
[list=none][*]${value(form.location)}[/list]
[*]Discord ID [b]:[/b]
[list=none][*]${value(form.discordId)}[/list]
[*]Have You Ever Played As A Police Officer? If Yes, Please Tell Us About It. [b]:[/b]
[list=none][*]${yesWithDetails(form.previousLeoExperience, form.previousLeoDetails)}[/list][/list][/divbox]`;
}

function SectionCard({ id, eyebrow, title, description, children }) {
  return <section aria-labelledby={id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
    <header className="border-b border-slate-100 bg-gradient-to-r from-emerald-50/90 to-white px-5 py-4 dark:border-slate-800 dark:from-emerald-950/50 dark:to-slate-900">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">{eyebrow}</p>
      <h2 id={id} className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h2>
      {description && <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>}
    </header>
    <div className="grid gap-x-4 gap-y-4 p-5 sm:grid-cols-2">{children}</div>
  </section>;
}

function TextField({ label, value, onChange, type = 'text', placeholder, required = true, ...props }) {
  return <label className="block min-w-0 text-xs font-semibold text-slate-700 dark:text-slate-300">
    {label}{required && <span className="ml-1 text-rose-600">*</span>}
    <input required={required} type={type} value={value} onChange={onChange} placeholder={placeholder} className={CONTROL_CLASS} {...props} />
  </label>;
}

function SelectField({ label, value, onChange, options, required = true }) {
  return <label className="block min-w-0 text-xs font-semibold text-slate-700 dark:text-slate-300">
    {label}{required && <span className="ml-1 text-rose-600">*</span>}
    <select required={required} value={value} onChange={onChange} className={CONTROL_CLASS}>
      <option value="" disabled>Pilih jawaban</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  </label>;
}

function LongAnswer({ label, value, onChange, wordMinimum = 0, required = true }) {
  const count = wordCount(value);
  const underMinimum = wordMinimum > 0 && count < wordMinimum;
  return <label className="block min-w-0 text-xs font-semibold text-slate-700 dark:text-slate-300 sm:col-span-2">
    <span>{label}{required && <span className="ml-1 text-rose-600">*</span>}</span>
    <textarea required={required} rows={wordMinimum ? 5 : 4} value={value} onChange={onChange} className={`${CONTROL_CLASS} resize-y leading-6`} placeholder="Tuliskan jawaban Anda di sini…" />
    <span className={`mt-1 block text-[11px] font-medium ${underMinimum ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
      {wordMinimum ? `${count} / ${wordMinimum} kata minimum` : `${count} kata`}
    </span>
  </label>;
}

function ForumSection({ title, children }) {
  return <section className="mt-5">
    <h3 className="bg-black px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white">{title}</h3>
    <div className="bg-white px-5 py-4 text-[13px] leading-6 text-slate-900 sm:px-7">{children}</div>
  </section>;
}

function ForumAnswer({ label, children }) {
  return <li className="pl-1">
    <p className="font-semibold">{label} <span className="font-bold">:</span></p>
    <div className="pl-3 text-slate-700">{children}</div>
  </li>;
}

function ForumVisual({ form }) {
  const { firstName: rawFirstName, lastName: rawLastName } = splitName(form.fullName);
  const firstName = rawFirstName || PLACEHOLDER;
  const lastName = rawLastName || PLACEHOLDER;
  const answer = (value) => value.trim() || PLACEHOLDER;
  const yesNo = (choice, details = '') => yesWithDetails(choice, details);
  const date = formattedDate(form.dateOfBirth);

  return <article className="overflow-hidden bg-white text-slate-900 shadow-sm">
    <header className="px-5 pb-5 pt-7 text-center sm:px-8">
      <div className="mb-5 flex items-center justify-center gap-3 sm:gap-5">
        <img src="https://imagizer.imageshack.com/v2/200x200q70/924/Rs1Hi8.png" alt="Recruitment logo" className="h-14 w-14 object-contain sm:h-[72px] sm:w-[72px]" />
        <img src="https://imagizer.imageshack.com/img924/9329/WjRSSl.png" alt="Law Enforcement logo" className="h-14 w-14 object-contain sm:h-[72px] sm:w-[72px]" />
        <img src="https://imageshack.com/i/pogQ42LOp" alt="Department logo" className="h-14 w-14 object-contain sm:h-[72px] sm:w-[72px]" />
      </div>
      <h2 className="text-lg font-bold tracking-wide sm:text-xl">LAW ENFORCEMENT OFFICER RECRUITMENT</h2>
    </header>

    <section className="px-5 pb-5 sm:px-8">
      <h3 className="text-base font-bold">INSTRUCTIONS FOR THE APPLICANT</h3>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-[13px] leading-6">
        <li>Answer the question with proper English or Bahasa.</li>
        <li>Replace each “Answer Here” with your answer.</li>
        <li>Make sure all answers are complete before submitting.</li>
        <li><strong>(( Any attempt to use false, misleading, or stolen identity information is a serious violation of our rules and may result in immediate suspension or permanent ban from this platform. Always provide accurate and truthful information. ))</strong></li>
        <li><strong>(( Your title should be [Police Officer Recruitment] Firstname Lastname of your character. ))</strong></li>
      </ul>
      <p className="mt-4 text-center text-sm font-extrabold">MAKE SURE THAT YOU READ THE RECRUITMENTS BEFORE APPLY</p>
    </section>

    <ForumSection title="Personal Information">
      <ol className="list-decimal space-y-3 pl-5">
        <li><p className="font-semibold">RECRUITEE NAME <strong>:</strong></p><ul className="list-disc pl-5 text-slate-700"><li>First Name: {firstName}</li><li>Last Name: {lastName}</li></ul></li>
        <ForumAnswer label="Date of Birth (DD/MM/YYYY)">{date}</ForumAnswer>
        <ForumAnswer label="Place of Birth">{answer(form.placeOfBirth)}</ForumAnswer>
        <ForumAnswer label="Gender">{answer(form.gender)}</ForumAnswer>
        <ForumAnswer label="Phone Number">{answer(form.phone)}</ForumAnswer>
        <ForumAnswer label="Citizen ID">{answer(form.citizenId)}</ForumAnswer>
      </ol>
    </ForumSection>

    <ForumSection title="Legal Information">
      <ol className="list-decimal space-y-3 pl-5">
        <ForumAnswer label="Do you have an Identification Card (ID/KTP)?">{answer(form.hasIdentityCard)}</ForumAnswer>
        <ForumAnswer label="Do you have a Driving License?">{answer(form.hasDrivingLicense)}</ForumAnswer>
        <ForumAnswer label="Have you ever received a ticket from LEO? If yes, please explain">{yesNo(form.ticketHistory, form.ticketDetails)}</ForumAnswer>
        <ForumAnswer label="Have you ever been detained by LEO? If yes, please explain">{yesNo(form.detainedHistory, form.detainedDetails)}</ForumAnswer>
        <ForumAnswer label="Have you ever been arrested by LEO? If yes, please explain">{yesNo(form.arrestedHistory, form.arrestedDetails)}</ForumAnswer>
        <ForumAnswer label="Have you joined any ridealong program? If yes, who were the officers?">{yesNo(form.ridealongHistory, form.ridealongDetails)}</ForumAnswer>
      </ol>
    </ForumSection>

    <ForumSection title="Personal Question">
      <ol className="list-decimal space-y-3 pl-5">
        <ForumAnswer label="Why do you want to apply as a Police Officer? (At least 100 words)">{answer(form.reasonToApply)}</ForumAnswer>
        <ForumAnswer label="Why should we accept you as a Police Officer? (At least 100 words)">{answer(form.reasonToAccept)}</ForumAnswer>
        <ForumAnswer label="What is the difference between LEO and civilian society group?">{answer(form.leoCivilianDifference)}</ForumAnswer>
      </ol>
    </ForumSection>

    <ForumSection title="(( Out of Character Information ))">
      <ol className="list-decimal space-y-3 pl-5">
        <ForumAnswer label="Real Life Name">{answer(form.realName)}</ForumAnswer>
        <ForumAnswer label="Real Life Age">{answer(form.realAge)}</ForumAnswer>
        <ForumAnswer label="Location">{answer(form.location)}</ForumAnswer>
        <ForumAnswer label="Discord ID">{answer(form.discordId)}</ForumAnswer>
        <ForumAnswer label="Have you ever played as a Police Officer? If yes, please tell us about it">{yesNo(form.previousLeoExperience, form.previousLeoDetails)}</ForumAnswer>
      </ol>
    </ForumSection>
  </article>;
}

export default function CvGeneratorPage() {
  useEffect(() => {
    document.title = 'RNT | CV Generator';
  }, []);

  const [form, setForm] = useState(INITIAL_FORM);
  const [copyMessage, setCopyMessage] = useState('');
  const [titleCopyMessage, setTitleCopyMessage] = useState('');
  const [previewMode, setPreviewMode] = useState('visual');
  const previewRef = useRef(null);
  const titleRef = useRef(null);
  const bbcode = useMemo(() => buildBbcode(form), [form]);
  const nameWords = form.fullName.trim().split(/\s+/).filter(Boolean);
  const forumTitle = `[Police Officer Recruitment] ${nameWords.length ? nameWords.join(' ') : 'Firstname Lastname'}`;

  const handleDateChange = (event) => {
    let value = event.target.value.replace(/\D/g, '');
    if (value.length > 8) value = value.slice(0, 8);
    if (value.length >= 5) {
      value = `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`;
    } else if (value.length >= 3) {
      value = `${value.slice(0, 2)}/${value.slice(2)}`;
    }
    setForm((current) => ({ ...current, dateOfBirth: value }));
    setCopyMessage('');
  };

  const update = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setCopyMessage('');
  };
  
  const isComplete = Object.entries(form).every(([key, value]) => {
    if (['ticketDetails', 'detainedDetails', 'arrestedDetails', 'ridealongDetails', 'previousLeoDetails'].includes(key)) return true;
    return Boolean(value.trim());
  }) && (form.ticketHistory !== 'YES' || form.ticketDetails.trim())
    && (form.detainedHistory !== 'YES' || form.detainedDetails.trim())
    && (form.arrestedHistory !== 'YES' || form.arrestedDetails.trim())
    && (form.ridealongHistory !== 'YES' || form.ridealongDetails.trim())
    && (form.previousLeoExperience !== 'YES' || form.previousLeoDetails.trim())
    && nameWords.length >= 2
    && wordCount(form.reasonToApply) >= 100
    && wordCount(form.reasonToAccept) >= 100;

  const copyBbcode = async () => {
    if (!isComplete) return;
    try {
      await navigator.clipboard.writeText(bbcode);
      setCopyMessage('Format CV berhasil disalin. Silakan tempel di forum.');
    } catch {
      previewRef.current?.focus();
      previewRef.current?.select();
      const copied = document.execCommand('copy');
      setCopyMessage(copied ? 'Format CV berhasil disalin. Silakan tempel di forum.' : 'Clipboard tidak tersedia. Format BBCode sudah dipilih; salin secara manual.');
    }
  };

  const copyForumTitle = async () => {
    if (nameWords.length < 2) return;
    try {
      await navigator.clipboard.writeText(forumTitle);
      setTitleCopyMessage('Judul topik berhasil disalin.');
    } catch {
      titleRef.current?.focus();
      titleRef.current?.select();
      const copied = document.execCommand('copy');
      setTitleCopyMessage(copied ? 'Judul topik berhasil disalin.' : 'Judul sudah dipilih. Silakan salin secara manual.');
    }
  };

  return <main className="min-h-screen bg-[#f2f5f1] text-slate-800 dark:bg-[#101813] dark:text-slate-100">
    <header className="border-b border-emerald-950/10 bg-white/90 dark:border-white/10 dark:bg-[#17251c]/95">
      <div className="mx-auto flex min-h-[68px] max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="min-w-0 text-sm font-bold text-[#20372a] dark:text-emerald-100">Recruitment and Training<small className="mt-0.5 block text-[10px] font-medium tracking-[0.08em] text-slate-500 dark:text-slate-400">PERSONNEL PORTAL</small></Link>
        <Link href="/" className="shrink-0 rounded-lg border border-emerald-800/25 px-3 py-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950/60">✦ Pendaftaran kandidat</Link>
      </div>
    </header>

    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-9 lg:px-8">
      <div className="mb-6 max-w-3xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-300">CV Recruitment Builder</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">Buat format pendaftaran LEO</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Isi setiap bagian di bawah. Format forum akan tersusun otomatis di pratinjau, termasuk pemisahan nama depan dan nama belakang.</p>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(440px,0.88fr)] 2xl:gap-7">
        <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
          <SectionCard id="cv-personal-information" eyebrow="01 · Candidate details" title="Personal Information" description="Gunakan data karakter yang akan didaftarkan.">
            <TextField label="Full Name" value={form.fullName} onChange={update('fullName')} placeholder="Contoh: John Michael Doe" minLength={2} />
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3.5 py-3 dark:border-emerald-900/70 dark:bg-emerald-950/30 sm:col-span-2">
              <p className="text-[11px] font-semibold text-emerald-950 dark:text-emerald-100">Nama di template akan dipisah otomatis</p>
              {(() => {
                const { firstName, lastName } = splitName(form.fullName);

                return (
                  <p className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-200/80">
                    First Name: <strong>{firstName || '—'}</strong>
                    <span className="mx-2 text-emerald-700/50">·</span>
                    Last Name: <strong>{lastName || '—'}</strong>
                  </p>
                );
              })()}
            </div>
            <TextField label="Date of Birth" type="text" placeholder="DD/MM/YYYY" maxLength={10} value={form.dateOfBirth} onChange={handleDateChange} />
            <TextField label="Place of Birth" value={form.placeOfBirth} onChange={update('placeOfBirth')} placeholder="Kota kelahiran" />
            <SelectField label="Gender" value={form.gender} onChange={update('gender')} options={['Male', 'Female']} />
            <TextField label="Phone Number" type="tel" value={form.phone} onChange={update('phone')} placeholder="Nomor telepon karakter" />
            <TextField label="Citizen ID" value={form.citizenId} onChange={update('citizenId')} placeholder="Nomor identitas karakter" />
          </SectionCard>

          <SectionCard id="cv-legal-information" eyebrow="02 · Declarations" title="Legal Information" description="Jawab dengan jujur. Jika memilih YES, jelaskan detailnya.">
            <SelectField label="Have an Identification Card (ID/KTP)?" value={form.hasIdentityCard} onChange={update('hasIdentityCard')} options={['YES', 'NO']} />
            <SelectField label="Have a Driving License?" value={form.hasDrivingLicense} onChange={update('hasDrivingLicense')} options={['YES', 'NO']} />
            <SelectField label="Ever received a ticket from LEO?" value={form.ticketHistory} onChange={update('ticketHistory')} options={['YES', 'NO']} />
            {form.ticketHistory === 'YES' && <TextField label="Ticket details" value={form.ticketDetails} onChange={update('ticketDetails')} placeholder="Jelaskan waktu dan alasannya" />}
            <SelectField label="Ever been detained by LEO?" value={form.detainedHistory} onChange={update('detainedHistory')} options={['YES', 'NO']} />
            {form.detainedHistory === 'YES' && <TextField label="Detention details" value={form.detainedDetails} onChange={update('detainedDetails')} placeholder="Jelaskan waktu dan alasannya" />}
            <SelectField label="Ever been arrested by LEO?" value={form.arrestedHistory} onChange={update('arrestedHistory')} options={['YES', 'NO']} />
            {form.arrestedHistory === 'YES' && <TextField label="Arrest details" value={form.arrestedDetails} onChange={update('arrestedDetails')} placeholder="Jelaskan waktu dan alasannya" />}
            <SelectField label="Joined any ridealong program?" value={form.ridealongHistory} onChange={update('ridealongHistory')} options={['YES', 'NO']} />
            {form.ridealongHistory === 'YES' && <TextField label="Ridealong officers" value={form.ridealongDetails} onChange={update('ridealongDetails')} placeholder="Nama officer yang mendampingi" />}
          </SectionCard>

          <SectionCard id="cv-personal-questions" eyebrow="03 · Written answers" title="Personal Questions" description="Dua jawaban pertama harus terdiri dari setidaknya 100 kata.">
            <LongAnswer label="Why do you want to apply as a Police Officer?" value={form.reasonToApply} onChange={update('reasonToApply')} wordMinimum={100} />
            <LongAnswer label="Why should we accept you as a Police Officer?" value={form.reasonToAccept} onChange={update('reasonToAccept')} wordMinimum={100} />
            <LongAnswer label="What is the difference between LEO and civilian society group?" value={form.leoCivilianDifference} onChange={update('leoCivilianDifference')} />
          </SectionCard>

          <SectionCard id="cv-ooc-information" eyebrow="04 · Out of character" title="OOC Information" description="Informasi pemain, bukan karakter.">
            <TextField label="Real Life Name" value={form.realName} onChange={update('realName')} placeholder="Nama Anda" />
            <TextField label="Real Life Age" type="number" min="1" max="120" value={form.realAge} onChange={update('realAge')} placeholder="Usia" />
            <TextField label="Location" value={form.location} onChange={update('location')} placeholder="Kota / zona waktu" />
            <TextField label="Discord ID" value={form.discordId} onChange={update('discordId')} placeholder="Username Discord" />
            <SelectField label="Have you ever played as a Police Officer?" value={form.previousLeoExperience} onChange={update('previousLeoExperience')} options={['YES', 'NO']} />
            {form.previousLeoExperience === 'YES' && <TextField label="Previous LEO experience" value={form.previousLeoDetails} onChange={update('previousLeoDetails')} placeholder="Ceritakan pengalaman faction LEO" />}
          </SectionCard>
        </form>

        <aside className="xl:sticky xl:top-4">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-emerald-950/5 dark:border-slate-800 dark:bg-slate-900">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">Live preview</p><h2 className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">Tampilan CV Recruitment</h2></div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">{isComplete ? 'SIAP DISALIN' : 'SEDANG DIISI'}</span>
            </header>
            <div className="p-4 sm:p-5">
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900/70 dark:bg-emerald-950/25">
                <label htmlFor="forum-topic-title" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-emerald-950 dark:text-emerald-200">Judul topik forum</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input ref={titleRef} id="forum-topic-title" readOnly value={forumTitle} className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2.5 font-mono text-xs font-semibold text-slate-800 outline-none dark:border-emerald-900 dark:bg-slate-950 dark:text-slate-100" />
                  <button type="button" onClick={copyForumTitle} disabled={nameWords.length < 2} className="shrink-0 rounded-lg bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-emerald-700 dark:hover:bg-emerald-600">Salin Judul</button>
                </div>
                {titleCopyMessage && <p role="status" aria-live="polite" className="mt-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">{titleCopyMessage}</p>}
                {nameWords.length < 2 && <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">Isi Full Name minimal dua kata untuk menyalin judul.</p>}
              </div>

              <div className="mb-3 flex w-fit items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Mode pratinjau">
                <button type="button" role="tab" aria-selected={previewMode === 'visual'} onClick={() => setPreviewMode('visual')} className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${previewMode === 'visual' ? 'bg-white text-emerald-900 shadow-sm dark:bg-slate-700 dark:text-emerald-200' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'}`}>Visual</button>
                <button type="button" role="tab" aria-selected={previewMode === 'bbcode'} onClick={() => setPreviewMode('bbcode')} className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${previewMode === 'bbcode' ? 'bg-white text-emerald-900 shadow-sm dark:bg-slate-700 dark:text-emerald-200' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'}`}>Kode BBCode</button>
              </div>
              {previewMode === 'visual' ? (
                <div className="max-h-[70vh] min-h-[560px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-100 p-2 dark:border-slate-700 dark:bg-slate-950 sm:p-3">
                  <ForumVisual form={form} />
                </div>
              ) : (
                <textarea aria-label="Pratinjau kode BBCode CV Recruitment" readOnly value={bbcode} className="min-h-[560px] max-h-[70vh] w-full resize-y overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[11px] leading-5 text-slate-700 outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
              )}
              <textarea ref={previewRef} aria-hidden="true" tabIndex={-1} readOnly value={bbcode} className="fixed left-[-10000px] top-0 h-px w-px opacity-0" />
              <div className="mt-3 flex flex-col gap-3">
                {!isComplete && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">Lengkapi semua bagian, isi nama lengkap minimal dua kata, dan pastikan dua jawaban pertama mencapai 100 kata sebelum menyalin.</p>}
                {copyMessage && <p role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs font-semibold text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200">{copyMessage}</p>}
                <button type="button" onClick={copyBbcode} disabled={!isComplete} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#254532] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#315a41] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-emerald-700 dark:hover:bg-emerald-600">
                  <span aria-hidden="true">▣</span> Salin BBCode untuk Forum
                </button>
                <p className="text-center text-[11px] leading-5 text-slate-500 dark:text-slate-400">Salin BBCode untuk ditempel ke forum. Tampilan Visual menunjukkan perkiraan hasil posting.</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  </main>;
}
