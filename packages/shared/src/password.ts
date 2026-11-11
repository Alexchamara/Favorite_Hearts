/**
 * Member passwords (owner decision, 11 Nov 2026): at least 8 characters, no composition rules, and common or personal
 * passwords refused. The same check runs in the member app (as the member types) and on the server (which decides).
 * Staff passwords stay at 12 characters or more (lib/staff-accounts.ts in the API).
 *
 * The list below is kept here, on our own server and in the app bundle: no password is ever sent anywhere to be
 * checked. It holds the passwords that lead the published "most common password" lists, words people around Sri Lanka
 * and this site would reach for, and keyboard runs. A password is refused when it is one of them, or one of them with
 * only digits or symbols added before or after ("Password2024!", "!!colombo1").
 */
export const MIN_PASSWORD_LENGTH = 8;
/** Long enough for any passphrase; short enough that hashing it stays cheap (Better-Auth's own limit is the same). */
export const MAX_PASSWORD_LENGTH = 128;
/** Failed log-ins to one email or phone number before it is locked for a while (any IP address). */
export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_LOCK_MINUTES = 15;
/** How long a password reset link lasts. */
export const PASSWORD_RESET_MINUTES = 60;

const COMMON = `
password passw0rd p@ssword p@ssw0rd pass pa55word password1 passwords passwort motdepasse contraseña secret secret1
123456 1234567 12345678 123456789 1234567890 0123456789 987654321 9876543210 111111 1111111 11111111 000000 00000000
121212 123123 123123123 112233 11223344 654321 666666 696969 777777 7777777 888888 88888888 999999 99999999 101010
123321 147258 147258369 159753 159357 1q2w3e 1q2w3e4r 1q2w3e4r5t q1w2e3r4 q1w2e3r4t5 1qaz2wsx 1qazxsw2 zaq12wsx
qwerty qwerty1 qwerty12 qwerty123 qwertyui qwertyuiop qwert asdf asdfgh asdfghjk asdfghjkl zxcvbn zxcvbnm azerty
qazwsx qweasd qweasdzxc abc123 abcd1234 abcdef abcdefg abcdefgh a1b2c3 a1b2c3d4 aa123456 aaaaaa abc12345
iloveyou iloveu iloveyou1 loveyou love love123 lovely lover lovers loveme mylove truelove forever forever1 always
sweetheart sweetie sweet honey honey123 darling baby babygirl babyboy angel angel1 angels princess princess1
prince queen king kingdom beautiful beauty pretty cutie cute1234 heart hearts myheart heartbeat romance romantic
marriage married wedding husband wife bride groom couple together family family123 friends friend bestfriend
soulmate destiny dream dreams dreamer happiness happy happy123 smile sunshine sunny summer winter spring autumn
welcome welcome1 welcome123 hello hello123 hellohello letmein letmein1 trustno1 whatever nothing anything
monkey dragon dragon1 tiger lion eagle shadow master master1 superman batman spiderman pokemon naruto
football soccer baseball basketball cricket cricket1 tennis hockey golf runner
freedom liberty justice peace faith hope charity blessed blessing jesus jesus1 christ godisgood amen
computer internet login admin admin123 administrator root user user123 guest test test123 testing demo
default changeme change123 newpass newpassword mypassword mypass access access123 secure security
google gmail yahoo hotmail facebook instagram whatsapp youtube tiktok twitter apple samsung nokia iphone
mobile phone mobile123 android windows microsoft
starwars matrix killer hunter ranger thunder flower flowers rose roses lily orchid jasmine butterfly rainbow
chocolate cookie cookies cheese pizza banana orange apple123 mango mango123 coconut
michael jennifer jessica ashley daniel charlie thomas andrew joshua matthew robert william michelle
nicole amanda melissa sarah samantha
srilanka srilanka1 srilanka123 lanka lanka123 ceylon ceylon123 colombo colombo1 colombo123 kandy kandy123
galle jaffna negombo matara kurunegala anuradhapura gampaha kalutara ratnapura badulla trincomalee batticaloa
sinhala sinhalese tamil buddha buddhism dhamma sadhu theruwan ayubowan vanakkam namaste
sanath sangakkara jayasuriya muralitharan malinga mathews lions
matrimony matrimonial proposal proposals marriageproposal mangala mangalam poruwa
favorite favourite favoritehearts favouritehearts favhearts hearts123
`;

const RUNS = ['01234567890', '1234567890', '0987654321', '9876543210', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'qazwsxedc'];

export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(COMMON.split(/\s+/).filter(Boolean));

export type PasswordProblem = 'tooShort' | 'tooLong' | 'common' | 'personal';

/** What the person told us about themselves, so their own name, email or number cannot be the password. */
export type PasswordOwner = { name?: string | null; email?: string | null; phone?: string | null };

/** The first problem with `password`, or null when it may be used. */
export function passwordProblem(password: string, owner: PasswordOwner = {}): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'tooShort';
  if (password.length > MAX_PASSWORD_LENGTH) return 'tooLong';
  const lower = password.toLowerCase();
  const core = lower.replace(/^[^a-z඀-෿஀-௿]+|[^a-z඀-෿஀-௿]+$/g, '');
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(core) || COMMON_PASSWORDS.has(lower.replace(/\s+/g, ''))) return 'common';
  // One character repeated, or a run along the digits, the alphabet or a keyboard row ("aaaaaaaa", "34567890").
  if (/^(.)\1+$/.test(lower)) return 'common';
  if (RUNS.some((run) => run.includes(lower) || run.includes(core.length >= 6 ? core : '\u0000'))) return 'common';
  const squashed = lower.replace(/[^a-z0-9඀-෿஀-௿]/g, '');
  const personal = [
    ...(owner.name ?? '').toLowerCase().split(/[\s.'-]+/),
    (owner.email ?? '').toLowerCase().split('@')[0] ?? '',
    'favoritehearts',
    'favouritehearts',
  ].filter((part) => part.length >= 4);
  if (personal.some((part) => squashed.includes(part.replace(/[^a-z0-9඀-෿஀-௿]/g, '')))) return 'personal';
  const digits = (owner.phone ?? '').replace(/\D/g, '');
  if (digits.length >= 7 && lower.replace(/\D/g, '').includes(digits.slice(-7))) return 'personal';
  return null;
}
