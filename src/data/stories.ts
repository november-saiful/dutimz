export type Story = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  categorySlug: string;
  author: string;
  time: string;
  imageClass: string;
  isDemo?: boolean;
};

// Used only while PUBLIC_DEMO_MODE=true (the default for local development).
// Production builds disable demo mode in GitHub Actions and read published
// articles from Supabase instead of presenting illustrative copy as reporting.
export const previewStories: Story[] = [
  {
    slug: 'campus-voices-preview',
    title: 'শিক্ষার্থীদের ভাবনা ও উদ্যোগে আরও প্রাণবন্ত হোক ক্যাম্পাস',
    excerpt: 'ক্যাম্পাসজুড়ে শিক্ষার্থীদের নতুন উদ্যোগ, মতামত আর সম্ভাবনার গল্প তুলে ধরবে ডুটিমজ।',
    category: 'ক্যাম্পাস',
    categorySlug: 'campus',
    author: 'সম্পাদকীয় ডেস্ক',
    time: 'প্রিভিউ',
    imageClass: 'art-campus',
    isDemo: true,
  },
  {
    slug: 'library-preview',
    title: 'পড়াশোনা, গবেষণা ও মুক্তচিন্তার মিলনস্থল আমাদের বিশ্ববিদ্যালয়',
    excerpt: 'বিশ্ববিদ্যালয়ের নানা পরিসর থেকে উঠে আসা ভাবনা ও অভিজ্ঞতার জন্য থাকছে আলাদা আয়োজন।',
    category: 'বিশ্ববিদ্যালয়',
    categorySlug: 'university',
    author: 'সম্পাদকীয় ডেস্ক',
    time: 'প্রিভিউ',
    imageClass: 'art-library',
    isDemo: true,
  },
  {
    slug: 'culture-preview',
    title: 'সংস্কৃতি, সৃজনশীলতা আর শিক্ষার্থীদের নিজের মঞ্চ',
    excerpt: 'ক্যাম্পাসের শিল্প, সাহিত্য ও সাংস্কৃতিক আয়োজনের খবর এক জায়গায়।',
    category: 'সংস্কৃতি',
    categorySlug: 'culture',
    author: 'সম্পাদকীয় ডেস্ক',
    time: 'প্রিভিউ',
    imageClass: 'art-culture',
    isDemo: true,
  },
  {
    slug: 'student-life-preview',
    title: 'ক্যাম্পাস জীবনের গল্পে শিক্ষার্থীদের কণ্ঠস্বর',
    excerpt: 'হল, ক্লাব, পাঠচক্র ও প্রতিদিনের ক্যাম্পাসজীবনের নানা দিক নিয়ে ধারাবাহিক আয়োজন।',
    category: 'শিক্ষার্থী জীবন',
    categorySlug: 'student-life',
    author: 'সম্পাদকীয় ডেস্ক',
    time: 'প্রিভিউ',
    imageClass: 'art-student',
    isDemo: true,
  },
];

export const categories = [
  { label: 'সব খবর', slug: 'all' },
  { label: 'ক্যাম্পাস', slug: 'campus' },
  { label: 'বিশ্ববিদ্যালয়', slug: 'university' },
  { label: 'শিক্ষার্থী জীবন', slug: 'student-life' },
  { label: 'সংস্কৃতি', slug: 'culture' },
  { label: 'মতামত', slug: 'opinion' },
  { label: 'ক্রীড়া', slug: 'sports' },
];
