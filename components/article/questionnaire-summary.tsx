import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { bn } from "@/lib/site";
import type { ArticleQuestionnaire } from "@/lib/stories";

/**
 * The reporter's answer sheet, drawn under the story. Each choice question shows every option, with
 * the ticked ones filled; headcounts and numbers are shown as figures. Nothing here names anyone:
 * the data it receives has already had free text and people's names removed.
 */
export function QuestionnaireSummary({
  questionnaire,
}: {
  questionnaire: ArticleQuestionnaire;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>তথ্য-সারসংক্ষেপ</CardTitle>
        <CardDescription>
          প্রতিবেদকের জমা দেওয়া প্রশ্নোত্তরের চিত্র। ব্যক্তির নাম বা পরিচয় দেখানো হয় না।
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {questionnaire.fields.map((field) => (
          <div key={field.id} className="flex flex-col gap-2">
            <p className="text-sm font-medium">{field.label}</p>
            {"choices" in field ? (
              <ul className="flex flex-col gap-2">
                {field.choices.map((choice) => (
                  <li key={choice.label} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span>{choice.label}</span>
                      <span className="text-muted-foreground">
                        {choice.selected ? "নির্বাচিত" : "—"}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden bg-muted" aria-hidden>
                      <div
                        className="h-full bg-primary transition-[width] duration-500"
                        style={{ width: choice.selected ? "100%" : "0%" }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-2xl font-semibold tabular-nums">
                {bn(field.count)}
                {field.type === "people" ? " জন" : ""}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
