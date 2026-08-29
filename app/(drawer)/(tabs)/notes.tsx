import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from "../../../src/context/AuthContext";
import { supabase } from "../../../src/lib/supabase";
import { ZeroTaskHeader } from "../../../src/components/ZeroTaskHeader";
import { Colors, Typography, Layout } from '../../../src/theme/tokens';

interface Note {
  id: string;
  title: string;
  content: string;
  updated_at: string;
}
export default function NotesScreen() {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  // Debounce saving timer reference
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchNotes = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('user_notes')
      .select('*')
      .eq('user_id', profile.id)
      .order('updated_at', { ascending: false });

    if (data && !error) {
      setNotes(data);
    }
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Debounced auto-save
  useEffect(() => {
    if (!profile?.id || !activeNoteId) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      const { error } = await supabase
        .from('user_notes')
        .update({
          title: title.trim() || 'Untitled Note',
          content,
          updated_at: new Date().toISOString()
        })
        .eq('id', activeNoteId);
      
      if (!error && isMounted.current) {
        // Optimistically update local list so it reflects the auto-save time
        setNotes(prev => prev.map(n => 
          n.id === activeNoteId ? { ...n, title: title.trim() || 'Untitled Note', content, updated_at: new Date().toISOString() } : n
        ));
      }
    }, 500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [title, content, activeNoteId, profile?.id]);

  const handleCreateNew = async () => {
    if (!profile?.id) return;
    
    const newNote = {
      user_id: profile.id,
      title: 'Untitled Note',
      content: '',
    };
    
    const { data, error } = await supabase
      .from('user_notes')
      .insert([newNote])
      .select()
      .single();

    if (data && !error) {
      setNotes([data, ...notes]);
      setActiveNoteId(data.id);
      setTitle(data.title);
      setContent(data.content || '');
    } else {
      Alert.alert('Error', 'Could not create new note.');
    }
  };

  const handleSelectNote = (note: Note) => {
    setActiveNoteId(note.id);
    setTitle(note.title);
    setContent(note.content || '');
  };

  const handleCloseEditor = () => {
    setActiveNoteId(null);
    setTitle('');
    setContent('');
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      "Delete Note",
      "Are you sure you want to delete this note?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.from('user_notes').delete().eq('id', id);
            if (!error) {
              setNotes(notes.filter(n => n.id !== id));
              if (activeNoteId === id) {
                setActiveNoteId(null);
                setTitle('');
                setContent('');
              }
            }
          }
        }
      ]
    );
  };

  const handleCopy = async (text: string) => {
    await Clipboard.setStringAsync(text || '');
    Alert.alert("Copied", "Note content copied to clipboard!");
  };

  // Only show notes that are not currently open in the active editor
  const displayedNotes = notes.filter(n => n.id !== activeNoteId);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ZeroTaskHeader />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notes</Text>
        <TouchableOpacity style={styles.newButton} onPress={handleCreateNew} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color={Colors.textInverse} />
          <Text style={styles.newButtonText}>New Note</Text>
        </TouchableOpacity>
      </View>

      {activeNoteId && (
        <View style={styles.editorContainer}>
          <View style={styles.editorHeader}>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Note Title"
              placeholderTextColor={Colors.textMuted}
            />
            <TouchableOpacity 
              style={styles.doneButton} 
              onPress={handleCloseEditor}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.contentInput}
            value={content}
            onChangeText={setContent}
            placeholder="Type your note here..."
            placeholderTextColor={Colors.textMuted}
            multiline
            textAlignVertical="top"
            autoFocus
          />
        </View>
      )}

      <FlashList
        data={displayedNotes}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          !loading && !activeNoteId ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No notes yet</Text>
              <Text style={styles.emptySubtitle}>Tap "New Note" to create your first note.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.noteCard}
            onPress={() => handleSelectNote(item)}
            activeOpacity={0.7}
          >
            <View style={styles.noteCardHeader}>
              <Text style={styles.noteTitle} numberOfLines={1}>{item.title || 'Untitled Note'}</Text>
              <View style={styles.noteActions}>
                <TouchableOpacity onPress={() => handleCopy(item.content)} style={styles.actionIcon} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="copy-outline" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionIcon} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.notePreview} numberOfLines={2}>
              {item.content || 'Empty note...'}
            </Text>
            <Text style={styles.noteDate}>
              {new Date(item.updated_at).toLocaleString()}
            </Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: Layout.spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  headerTitle: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  newButton: {
    flexDirection: 'row',
    backgroundColor: Colors.primary,
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: Layout.spacing.xs,
    borderRadius: Layout.radius.full,
    alignItems: 'center',
  },
  newButtonText: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    marginLeft: 4,
  },
  editorContainer: {
    backgroundColor: Colors.surface,
    padding: Layout.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Layout.spacing.sm,
  },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Layout.radius.sm,
    backgroundColor: Colors.primaryLight,
  },
  doneButtonText: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xs,
    marginLeft: 4,
  },
  titleInput: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
    flex: 1,
    paddingRight: 12,
  },
  contentInput: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textPrimary,
    minHeight: 100,
    maxHeight: 200,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
    marginTop: Layout.spacing.md,
  },
  emptySubtitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginTop: Layout.spacing.xs,
    textAlign: 'center',
  },
  listContainer: {
    padding: Layout.spacing.lg,
    paddingBottom: 100,
  },
  noteCard: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.md,
    padding: Layout.spacing.lg,
    marginBottom: Layout.spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    ...Layout.shadow.card,
  },
  activeNoteCard: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  noteCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Layout.spacing.sm,
  },
  noteTitle: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
    flex: 1,
  },
  noteActions: {
    flexDirection: 'row',
  },
  actionIcon: {
    marginLeft: Layout.spacing.sm,
    padding: 4,
  },
  notePreview: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginBottom: Layout.spacing.md,
    lineHeight: Typography.lineHeight.base,
  },
  noteDate: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.mono,
  }
});
