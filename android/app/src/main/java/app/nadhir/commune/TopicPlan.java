package app.nadhir.commune;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;

public final class TopicPlan {

    public static final class Op {

        public final boolean join;
        public final String topic;

        public Op(boolean join, String topic) {
            this.join = join;
            this.topic = topic;
        }

        @Override
        public boolean equals(Object other) {
            if (!(other instanceof Op)) return false;
            Op op = (Op) other;
            return join == op.join && topic.equals(op.topic);
        }

        @Override
        public int hashCode() {
            return Objects.hash(join, topic);
        }

        @Override
        public String toString() {
            return (join ? "+" : "-") + topic;
        }
    }

    public static String topic(String code, String lang) {
        return "v1.commune." + code + "." + lang;
    }

    public static List<Op> plan(String oldCode, String newCode, String oldLang, String newLang, Set<String> pinned) {
        List<Op> ops = new ArrayList<>();
        String target = newCode == null ? oldCode : newCode;
        // re-joining the held topic on every fix heals token rotation and ops that failed or landed late
        if (Objects.equals(oldCode, target) && Objects.equals(oldLang, newLang)) {
            if (target != null && !pinned.contains(target)) ops.add(new Op(true, topic(target, newLang)));
            return ops;
        }
        if (oldCode != null && !pinned.contains(oldCode)) ops.add(new Op(false, topic(oldCode, oldLang)));
        if (target != null && !pinned.contains(target)) ops.add(new Op(true, topic(target, newLang)));
        return ops;
    }

    public static List<Op> repin(String current, String oldLang, String newLang, Set<String> oldPinned, Set<String> newPinned) {
        List<Op> ops = new ArrayList<>();
        if (current == null) return ops;
        boolean wasPinned = oldPinned.contains(current);
        boolean isPinned = newPinned.contains(current);
        if (wasPinned && !isPinned) ops.add(new Op(true, topic(current, newLang)));
        else if (!wasPinned && isPinned) {
            if (!oldLang.equals(newLang)) ops.add(new Op(false, topic(current, oldLang)));
        } else if (!wasPinned && !oldLang.equals(newLang)) {
            ops.add(new Op(false, topic(current, oldLang)));
            ops.add(new Op(true, topic(current, newLang)));
        }
        return ops;
    }

    private TopicPlan() {}
}
