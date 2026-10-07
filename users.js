/* The people who can open the Brocare tools, and how documents sign off for each.
   Passwords are never stored here: only a PBKDF2-SHA256 fingerprint of each one.
   Set or change a password with:  python tools/set_password.py <username>
   A username with no fingerprint cannot sign in. */
window.BROCARE_COMPANY = {
  address:  'Beirut, Ein el Tineh, Mousaitbeh 5046, 4th Floor',
  phone:    '+961 1 82 33 00',
  whatsapp: '+961 81 82 33 00'   /* the company WhatsApp line */
};
window.BROCARE_USERS = {
  ali:    { name:'Ali Mohamad',   whatsapp:'+961 76 743 111', email:'ali.m@brocareinsurance.com',    salt:'b8e15599fd8af8d161ca9768b4d02da9', hash:'5e2d474f9e7cdb1f1d5ac0a07aa92368ba7106a022aa52e5893cb766b802d250' },
  zahraa: { name:'Zahraa Sherry', whatsapp:'+961 78 828 216', email:'zahraa.s@brocareinsurance.com', salt:'337ddfd5900c8b87b26761d929b4cac7', hash:'03030fd20427de31f1a2404b8a33f66c09af7bc91d882c59b8abcc54fb40503c' },
  zeinab: { name:'Zeinab Majeb',  whatsapp:'+961 3 372 190',  email:'zeinab.m@brocareinsurance.com', salt:'8c0fb92b1ef481f068cd872240b1ce1b', hash:'885f56e4bf03ca5a6590d7a26534d76c01a729f2b08d9a79cc79d09486cd6577' },
  rony:   { name:'Rony Sadek',    whatsapp:'+961 3 322 836',  email:'rony.s@brocareinsurance.com',   salt:'cd539eba48caf4c685721dbf24a48172', hash:'160fa1107d5d72d61b2375de72a230ec2218f07014a5cda247531a52bcbe69f8' },
  sahar:  { name:'Sahar Hoteit',  whatsapp:'+961 3 924 914',  email:'sahar.h@brocareinsurance.com',  salt:'46c5586be0621d9fa272819c88f6f3a9', hash:'3991673b29d169139a54782f497b48c0336cabd812d0dcb6560789c33c9b23bd' },
  nour:   { name:'Nour Sabra',    whatsapp:'+961 71 297 529', email:'nour.s@brocareinsurance.com',   salt:'6fe8b97d58c88fe67d94fe069ef79d26', hash:'ee74e845232cfb7336c1b4b6832ca4365bf6f0ab7a161a8da47f8a5934e34f9c' }
};
